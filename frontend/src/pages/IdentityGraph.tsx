import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { X, Play, Filter, Eye, EyeOff } from "lucide-react";

import { PressureFilter } from "../components/PressureFilter";
import { PressureText } from "../components/PressureText";
import { AnimatedDataReaperLogo } from "../components/AnimatedDataReaperLogo";
import {
  dataReaperQueryKeys,
  useIdentityGraphNodeQuery,
  useIdentityGraphQuery,
  useScanStatusQuery,
} from "../lib/hooks";
import { useScanContext, useRequireScan } from "../lib/scanContext";
import { useRealtimeSubscription, type RealtimeConnectionStatus } from "../lib/wsClient";

const COLORS = {
  bg: "#f5f3ef",
  card: "#f1eee8",
  paper: "#fdfbf7",
  blue: "#4a6fa5",
  orange: "#d17a22",
  red: "#b94a48",
  green: "#4f7d5c",
  purple: "#7b6fb5",
  text: "#1f1f1f",
  textSec: "#5a5a5a",
};

type GraphNode = {
  id: string;
  type: "seed" | "platform" | "username" | "identity" | "target";
  label: string;
  x: number;
  y: number;
  connections: string[];
  revealStep?: number;
  data?: {
    platform?: string;
    value?: string;
    status?: string;
    details?: string[];
  };
};

type GraphEdge = {
  fromNodeId: string;
  toNodeId: string;
};

type RoutedGraphEdge = GraphEdge & {
  key: string;
  fromLane: number;
  fromLaneCount: number;
  toLane: number;
  toLaneCount: number;
  orbitOffset: number;
};

type RingPlacementCandidate = {
  node: GraphNode;
  preferredAngle: number;
  footprint: number;
  clusterKey: string;
  primaryParentId: string | null;
  branchRootId: string | null;
};

type RingPlacementCluster = {
  key: string;
  preferredAngle: number;
  span: number;
  nodes: RingPlacementCandidate[];
};

type PositionedGraphNode = GraphNode & {
  x: number;
  y: number;
  angle: number;
  level: number;
  ringIndex: number;
  ringCount: number;
};

type GraphLayout = {
  width: number;
  height: number;
  center: { x: number; y: number };
  nodes: PositionedGraphNode[];
};

type GraphTransform = {
  x: number;
  y: number;
  scale: number;
};

type NodeLayoutConstraint = {
  preferredAngle: number;
  preferredRadius: number;
  footprint: number;
  parentId: string | null;
  branchRootId: string | null;
  level: number;
};

type PreparedGraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

const RING_RADIUS_BY_TYPE: Record<Exclude<GraphNode["type"], "seed">, number> = {
  platform: 148,
  username: 246,
  identity: 346,
  target: 452,
};
const GRAPH_CANVAS_SIZE = 1540;
const GRAPH_CENTER = GRAPH_CANVAS_SIZE / 2;
const RING_ORDER: Array<Exclude<GraphNode["type"], "seed">> = ["platform", "username", "identity", "target"];
const RING_ANGLE_OFFSET: Partial<Record<GraphNode["type"], number>> = {
  platform: 0,
  username: Math.PI / 12,
  identity: Math.PI / 8,
  target: Math.PI / 10,
};
const RING_LABEL_WIDTH_BY_TYPE: Record<Exclude<GraphNode["type"], "seed">, number> = {
  platform: 108,
  username: 132,
  identity: 176,
  target: 192,
};
const RING_PADDING_BY_TYPE: Record<Exclude<GraphNode["type"], "seed">, number> = {
  platform: 44,
  username: 54,
  identity: 64,
  target: 76,
};
const EDGE_LANE_SPACING = 18;
const EDGE_ORBIT_PADDING = 84;
const EDGE_TANGENT_LIFT = 22;
const EDGE_RADIAL_EXIT = 20;
const FULL_TURN = Math.PI * 2;
const GENERIC_NOISE_LABELS = new Set([
  "unknown",
  "undefined",
  "null",
  "none",
  "n/a",
  "na",
  "https",
  "http",
  "www",
  "browser",
  "have browser",
  "another",
  "overview",
]);
const PLATFORM_EQUIVALENTS = new Map([
  ["x.com", "twitter"],
  ["twitter.com", "twitter"],
  ["instagram.com", "instagram"],
  ["github.com", "github"],
  ["telegram.org", "telegram"],
  ["t.me", "telegram"],
  ["mastodon.social", "mastodon"],
  ["linkedin.com", "linkedin"],
  ["leetcode.com", "leetcode"],
  ["pinterest.com", "pinterest"],
  ["huggingface.co", "huggingface"],
  ["reddit.com", "reddit"],
  ["threads.net", "threads"],
]);

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function slugifyGraphText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}._/\-:@ ]+/gu, "");
}

function looksLikeEmail(value: string | undefined) {
  return Boolean(value && /.+@.+\..+/.test(value.trim()));
}

function looksLikeUrlish(value: string | undefined) {
  return Boolean(value && /^(https?:\/\/|www\.)/i.test(value.trim()));
}

function looksLikeHostname(value: string | undefined) {
  return Boolean(value && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(value.trim()));
}

function looksLikeSemverish(value: string | undefined) {
  return Boolean(value && /^\d+\.\d+\.\d+(?:[-+._a-z0-9]+)?$/i.test(value.trim()));
}

function extractHostname(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    return url.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return trimmed
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/\/.*$/, "")
      .toLowerCase();
  }
}

function canonicalizeGraphLabel(node: GraphNode) {
  const raw = String(node.data?.value ?? node.label ?? "").trim();
  if (!raw) {
    return "";
  }

  if (looksLikeEmail(raw)) {
    return raw.toLowerCase();
  }

  if (looksLikeUrlish(raw) || looksLikeHostname(raw)) {
    const hostname = extractHostname(raw);
    if (node.type === "platform") {
      return PLATFORM_EQUIVALENTS.get(hostname) ?? hostname;
    }
    return hostname || slugifyGraphText(raw);
  }

  const slug = slugifyGraphText(raw);
  if (node.type === "platform") {
    return PLATFORM_EQUIVALENTS.get(slug) ?? slug;
  }
  return slug;
}

function getGraphNodeDisplayLabel(node: GraphNode) {
  const canonical = canonicalizeGraphLabel(node);
  if (!canonical) {
    return node.label;
  }

  if (looksLikeEmail(canonical)) {
    return canonical;
  }

  if (node.type === "platform") {
    return canonical;
  }

  return node.label.trim() || canonical;
}

function isLowSignalGraphNode(node: GraphNode) {
  const canonical = canonicalizeGraphLabel(node);
  if (!canonical) {
    return true;
  }

  if (node.type !== "seed" && GENERIC_NOISE_LABELS.has(canonical)) {
    return true;
  }

  if (node.type !== "seed" && looksLikeSemverish(canonical)) {
    return true;
  }

  if ((node.type === "username" || node.type === "identity") && (canonical === "https" || canonical === "http")) {
    return true;
  }

  if ((node.type === "username" || node.type === "identity") && /\s{2,}/.test(node.label)) {
    return true;
  }

  return false;
}

function getCanonicalNodeKey(node: GraphNode) {
  const canonical = canonicalizeGraphLabel(node);
  if (node.type === "seed") {
    return `seed:${canonical || node.id}`;
  }
  return `${node.type}:${canonical || node.id}`;
}

function scoreGraphNode(node: GraphNode, degree: number) {
  const canonical = canonicalizeGraphLabel(node);
  let score = degree * 5;

  if (node.type === "seed") {
    score += 80;
  }
  if (node.data?.details?.length) {
    score += Math.min(node.data.details.length, 4) * 3;
  }
  if (node.data?.platform) {
    score += 4;
  }
  if (looksLikeEmail(canonical)) {
    score += 16;
  }
  if (looksLikeHostname(canonical)) {
    score += 8;
  }
  if (node.label === canonical) {
    score += 3;
  }
  if (isLowSignalGraphNode(node)) {
    score -= 40;
  }

  return score;
}

function mergeGraphNodeData(primary: GraphNode, incoming: GraphNode) {
  const mergedDetails = Array.from(
    new Set([...(primary.data?.details ?? []), ...(incoming.data?.details ?? [])].map((detail) => detail.trim()).filter(Boolean))
  );

  return {
    ...primary,
    label:
      getGraphNodeDisplayLabel(primary).length >= getGraphNodeDisplayLabel(incoming).length
        ? getGraphNodeDisplayLabel(primary)
        : getGraphNodeDisplayLabel(incoming),
    connections: Array.from(new Set([...primary.connections, ...incoming.connections])),
    revealStep:
      primary.revealStep == null
        ? incoming.revealStep
        : incoming.revealStep == null
          ? primary.revealStep
          : Math.min(primary.revealStep, incoming.revealStep),
    data: {
      ...incoming.data,
      ...primary.data,
      platform: primary.data?.platform ?? incoming.data?.platform,
      value: primary.data?.value ?? incoming.data?.value ?? getGraphNodeDisplayLabel(primary),
      status: primary.data?.status ?? incoming.data?.status,
      details: mergedDetails.length > 0 ? mergedDetails : undefined,
    },
  };
}

function computeNodeDegrees(nodes: GraphNode[], edges: GraphEdge[]) {
  const degreeMap = new Map<string, number>();
  for (const node of nodes) {
    degreeMap.set(node.id, new Set(node.connections).size);
  }
  for (const edge of edges) {
    degreeMap.set(edge.fromNodeId, (degreeMap.get(edge.fromNodeId) ?? 0) + 1);
    degreeMap.set(edge.toNodeId, (degreeMap.get(edge.toNodeId) ?? 0) + 1);
  }
  return degreeMap;
}

function prepareGraphData(nodes: GraphNode[], edges: GraphEdge[]): PreparedGraphData {
  if (nodes.length === 0) {
    return { nodes, edges };
  }

  const centerNode = getCenterGraphNode(nodes);
  const degreeMap = computeNodeDegrees(nodes, edges);
  const aliasById = new Map<string, string>();
  const dedupedByKey = new Map<string, GraphNode>();
  const survivorScoreById = new Map<string, number>();

  for (const node of nodes) {
    if (node.id !== centerNode?.id && isLowSignalGraphNode(node) && (degreeMap.get(node.id) ?? 0) <= 1) {
      continue;
    }

    const cleanedNode: GraphNode = {
      ...node,
      label: getGraphNodeDisplayLabel(node),
      data: {
        ...node.data,
        value: node.data?.value ?? getGraphNodeDisplayLabel(node),
      },
    };

    const canonicalKey = getCanonicalNodeKey(cleanedNode);
    const existing = dedupedByKey.get(canonicalKey);
    const nodeScore = scoreGraphNode(cleanedNode, degreeMap.get(node.id) ?? 0);

    if (!existing) {
      dedupedByKey.set(canonicalKey, cleanedNode);
      aliasById.set(node.id, cleanedNode.id);
      survivorScoreById.set(cleanedNode.id, nodeScore);
      continue;
    }

    const existingScore = survivorScoreById.get(existing.id) ?? scoreGraphNode(existing, degreeMap.get(existing.id) ?? 0);
    if (nodeScore > existingScore) {
      const merged = mergeGraphNodeData(cleanedNode, existing);
      dedupedByKey.set(canonicalKey, merged);
      survivorScoreById.delete(existing.id);
      survivorScoreById.set(merged.id, nodeScore);
      aliasById.set(existing.id, merged.id);
      aliasById.set(node.id, merged.id);
    } else {
      dedupedByKey.set(canonicalKey, mergeGraphNodeData(existing, cleanedNode));
      aliasById.set(node.id, existing.id);
    }
  }

  const dedupedNodes = Array.from(dedupedByKey.values());
  const survivingIds = new Set(dedupedNodes.map((node) => node.id));
  const adjacency = new Map<string, Set<string>>();
  for (const node of dedupedNodes) {
    adjacency.set(node.id, new Set());
  }

  const pushEdge = (fromId: string, toId: string) => {
    if (!survivingIds.has(fromId) || !survivingIds.has(toId) || fromId === toId) {
      return;
    }
    adjacency.get(fromId)?.add(toId);
    adjacency.get(toId)?.add(fromId);
  };

  for (const node of nodes) {
    const fromId = aliasById.get(node.id);
    if (!fromId) {
      continue;
    }
    for (const connectionId of node.connections) {
      const toId = aliasById.get(connectionId);
      if (!toId) {
        continue;
      }
      pushEdge(fromId, toId);
    }
  }

  for (const edge of edges) {
    const fromId = aliasById.get(edge.fromNodeId);
    const toId = aliasById.get(edge.toNodeId);
    if (!fromId || !toId) {
      continue;
    }
    pushEdge(fromId, toId);
  }

  const reachable = new Set<string>();
  const startId = aliasById.get(centerNode?.id ?? "") ?? centerNode?.id ?? dedupedNodes[0]?.id;
  if (startId) {
    const queue = [startId];
    reachable.add(startId);
    while (queue.length > 0) {
      const currentId = queue.shift();
      if (!currentId) {
        continue;
      }
      for (const nextId of adjacency.get(currentId) ?? []) {
        if (reachable.has(nextId)) {
          continue;
        }
        reachable.add(nextId);
        queue.push(nextId);
      }
    }
  }

  const filteredNodes = dedupedNodes.filter((node) => reachable.has(node.id));
  const filteredIds = new Set(filteredNodes.map((node) => node.id));
  const filteredEdges: GraphEdge[] = [];
  const seenEdgeKeys = new Set<string>();

  filteredNodes.forEach((node) => {
    node.connections = Array.from(adjacency.get(node.id) ?? []).filter((connectionId) => filteredIds.has(connectionId));
  });

  for (const node of filteredNodes) {
    for (const connectionId of node.connections) {
      const key = `${node.id}::${connectionId}`;
      if (seenEdgeKeys.has(key)) {
        continue;
      }
      seenEdgeKeys.add(key);
      filteredEdges.push({
        fromNodeId: node.id,
        toNodeId: connectionId,
      });
    }
  }

  return {
    nodes: filteredNodes,
    edges: filteredEdges,
  };
}

function getCenterGraphNode(nodes: GraphNode[]) {
  return (
    nodes.find((node) => node.type === "seed" && looksLikeEmail(node.data?.value ?? node.label)) ??
    nodes.find((node) => node.type === "seed") ??
    nodes.find((node) => looksLikeEmail(node.data?.value ?? node.label)) ??
    nodes[0] ??
    null
  );
}

function normalizeAngle(angle: number) {
  return ((angle % FULL_TURN) + FULL_TURN) % FULL_TURN;
}

function averageAngle(angles: number[]) {
  if (angles.length === 0) {
    return null;
  }

  const sin = angles.reduce((sum, angle) => sum + Math.sin(angle), 0);
  const cos = angles.reduce((sum, angle) => sum + Math.cos(angle), 0);
  return Math.atan2(sin / angles.length, cos / angles.length);
}

function estimateLabelWidth(type: GraphNode["type"], label: string) {
  if (type === "seed") {
    return Math.min(240, Math.max(164, label.length * 8.8));
  }

  const baseWidth = RING_LABEL_WIDTH_BY_TYPE[type];
  return Math.min(baseWidth + 84, Math.max(baseWidth, label.length * 8.2));
}

function getNodeFootprint(type: GraphNode["type"], label: string) {
  const nodeDiameter = getNodeSize(type) * 2;
  return Math.max(nodeDiameter + 28, estimateLabelWidth(type, label) + 18);
}

function getRingRadius(type: Exclude<GraphNode["type"], "seed">, ringNodes: GraphNode[], previousRadius: number) {
  const baseRadius = RING_RADIUS_BY_TYPE[type];
  if (ringNodes.length === 0) {
    return Math.max(baseRadius, previousRadius);
  }

  const footprints = ringNodes.map((node) => getNodeFootprint(type, node.label) + RING_PADDING_BY_TYPE[type]);
  const maxFootprint = Math.max(...footprints);
  const circumferenceRadius = footprints.reduce((total, footprint) => total + footprint, 0) / (Math.PI * 2);
  const chordRadius = maxFootprint / (2 * Math.sin(Math.PI / Math.max(ringNodes.length, 3)));
  const densityOffset =
    type === "platform" ? Math.max(0, ringNodes.length - 8) * 14 :
    type === "username" ? Math.max(0, ringNodes.length - 6) * 18 :
    type === "identity" ? Math.max(0, ringNodes.length - 4) * 24 :
    Math.max(0, ringNodes.length - 3) * 28;
  const previousGap = previousRadius > 0 ? previousRadius + maxFootprint * 0.58 : 0;

  return Math.max(baseRadius + densityOffset, circumferenceRadius, chordRadius, previousGap);
}

function getMinimumRingSeparation(radius: number, ringNodes: GraphNode[]) {
  if (ringNodes.length <= 1) {
    return Math.PI * 2;
  }

  const maxFootprint = Math.max(...ringNodes.map((node) => getNodeFootprint(node.type, node.label)));
  return Math.min(Math.PI * 0.92, Math.max((maxFootprint + 18) / radius, (Math.PI * 2) / ringNodes.length));
}

function resolveAnglesWithMinimumSeparation(preferredAngles: number[], minimumSeparation: number) {
  if (preferredAngles.length === 0) {
    return [];
  }

  if (preferredAngles.length === 1) {
    return [normalizeAngle(preferredAngles[0] ?? (-Math.PI / 2))];
  }

  const sorted = preferredAngles
    .map((angle, index) => ({ angle: normalizeAngle(angle), index }))
    .sort((left, right) => left.angle - right.angle);

  const placed: Array<{ angle: number; index: number }> = [];
  for (const item of sorted) {
    let nextAngle = item.angle;
    if (placed.length > 0) {
      while (nextAngle <= placed[placed.length - 1].angle - minimumSeparation / 2) {
        nextAngle += Math.PI * 2;
      }
      nextAngle = Math.max(nextAngle, placed[placed.length - 1].angle + minimumSeparation);
    }
    placed.push({ angle: nextAngle, index: item.index });
  }

  const span = placed[placed.length - 1].angle - placed[0].angle;
  if (span > Math.PI * 2 - minimumSeparation) {
    const compressedStep = (Math.PI * 2 - minimumSeparation) / Math.max(1, preferredAngles.length - 1);
    const centerAngle = averageAngle(preferredAngles) ?? (-Math.PI / 2);
    const startAngle = centerAngle - (compressedStep * (preferredAngles.length - 1)) / 2;
    return preferredAngles.map((_, index) => normalizeAngle(startAngle + index * compressedStep));
  }

  const preferredCenter = averageAngle(preferredAngles) ?? placed[0].angle;
  const placedCenter = placed[0].angle + span / 2;
  const shift = preferredCenter - placedCenter;

  const restored = new Array<number>(preferredAngles.length);
  for (const item of placed) {
    restored[item.index] = normalizeAngle(item.angle + shift);
  }
  return restored;
}

function getNodeTypeSortWeight(type: GraphNode["type"]) {
  switch (type) {
    case "seed":
      return 0;
    case "platform":
      return 1;
    case "username":
      return 2;
    case "identity":
      return 3;
    case "target":
      return 4;
    default:
      return 5;
  }
}

function getNodeLevel(type: GraphNode["type"]) {
  switch (type) {
    case "seed":
      return 0;
    case "platform":
      return 1;
    case "username":
      return 2;
    case "identity":
      return 3;
    case "target":
      return 4;
    default:
      return 5;
  }
}

function getClusterGap(type: Exclude<GraphNode["type"], "seed">) {
  switch (type) {
    case "platform":
      return 0.08;
    case "username":
      return 0.1;
    case "identity":
      return 0.115;
    case "target":
      return 0.13;
    default:
      return 0.1;
  }
}

function getNodeBandAmplitude(type: GraphNode["type"]) {
  switch (type) {
    case "platform":
      return 16;
    case "username":
      return 20;
    case "identity":
      return 24;
    case "target":
      return 30;
    default:
      return 0;
  }
}

function getRelativeAngle(angle: number, origin: number) {
  const normalized = normalizeAngle(angle - origin);
  return normalized > Math.PI ? normalized - FULL_TURN : normalized;
}

function getRingArcSpan(radius: number, footprint: number, minimum: number) {
  return Math.max(footprint / Math.max(radius, 1), minimum);
}

function getClusterSpan(radius: number, type: Exclude<GraphNode["type"], "seed">, nodes: RingPlacementCandidate[]) {
  const innerGap = getClusterGap(type) * 0.6;
  const itemSpans = nodes.map((candidate) => getRingArcSpan(radius, candidate.footprint, type === "platform" ? 0.16 : 0.18));
  return itemSpans.reduce((total, span) => total + span, 0) + innerGap * Math.max(0, nodes.length - 1);
}

function resolveClusterCenters(
  preferredAngles: number[],
  spans: number[],
  gap: number
) {
  if (preferredAngles.length === 0) {
    return [];
  }

  if (preferredAngles.length === 1) {
    return [normalizeAngle(preferredAngles[0] ?? (-Math.PI / 2))];
  }

  const sorted = preferredAngles
    .map((angle, index) => ({
      angle: normalizeAngle(angle),
      index,
      span: spans[index] ?? 0.3,
    }))
    .sort((left, right) => left.angle - right.angle);

  const totalRequired = sorted.reduce((total, item) => total + item.span, 0) + gap * Math.max(0, sorted.length - 1);

  if (totalRequired >= FULL_TURN * 0.94) {
    const startAngle = -Math.PI / 2 - totalRequired / 2;
    const restored = new Array<number>(preferredAngles.length);
    let cursor = startAngle;
    for (const item of sorted) {
      cursor += item.span / 2;
      restored[item.index] = normalizeAngle(cursor);
      cursor += item.span / 2 + gap;
    }
    return restored;
  }

  const placed: Array<{ angle: number; index: number; span: number }> = [];
  for (const item of sorted) {
    let angle = item.angle;
    if (placed.length > 0) {
      while (angle <= placed[placed.length - 1].angle - gap) {
        angle += FULL_TURN;
      }
      const required =
        placed[placed.length - 1].angle +
        (placed[placed.length - 1].span + item.span) / 2 +
        gap;
      angle = Math.max(angle, required);
    }
    placed.push({
      angle,
      index: item.index,
      span: item.span,
    });
  }

  const preferredCenter = averageAngle(preferredAngles) ?? (-Math.PI / 2);
  const placedCenter = averageAngle(placed.map((item) => normalizeAngle(item.angle))) ?? placed[0].angle;
  const shift = preferredCenter - placedCenter;
  const restored = new Array<number>(preferredAngles.length);
  for (const item of placed) {
    restored[item.index] = normalizeAngle(item.angle + shift);
  }
  return restored;
}

function buildClusterAngles(
  centerAngle: number,
  radius: number,
  type: Exclude<GraphNode["type"], "seed">,
  nodes: RingPlacementCandidate[]
) {
  if (nodes.length === 0) {
    return [];
  }

  const innerGap = getClusterGap(type) * 0.55;
  const orderedNodes = [...nodes].sort((left, right) => {
    const leftRelative = getRelativeAngle(left.preferredAngle, centerAngle);
    const rightRelative = getRelativeAngle(right.preferredAngle, centerAngle);
    if (Math.abs(leftRelative - rightRelative) > 0.0001) {
      return leftRelative - rightRelative;
    }
    return left.node.label.localeCompare(right.node.label);
  });
  const spans = orderedNodes.map((candidate) => getRingArcSpan(radius, candidate.footprint, type === "platform" ? 0.16 : 0.18));
  const totalSpan = spans.reduce((total, span) => total + span, 0) + innerGap * Math.max(0, orderedNodes.length - 1);
  let cursor = centerAngle - totalSpan / 2;

  return orderedNodes.map((candidate, index) => {
    cursor += spans[index] / 2;
    const angle = normalizeAngle(cursor);
    cursor += spans[index] / 2 + innerGap;
    const clusterSize = orderedNodes.length;
    const bandOffset =
      clusterSize >= 5
        ? ((index % 3) - 1) * (type === "platform" ? 18 : 24)
        : clusterSize >= 3
          ? (index % 2 === 0 ? -14 : 14)
          : 0;
    return {
      candidate,
      angle,
      radiusOffset: bandOffset,
    };
  });
}

function buildResolvedEdges(nodes: GraphNode[], fallbackEdges: GraphEdge[]): GraphEdge[] {
  const resolvedEdges: GraphEdge[] = [];
  const seenConnections = new Set<string>();
  const nodeIds = new Set(nodes.map((node) => node.id));

  for (const node of nodes) {
    for (const connectionId of node.connections) {
      if (!nodeIds.has(connectionId)) {
        continue;
      }
      const key = `${node.id}::${connectionId}`;
      if (seenConnections.has(key)) {
        continue;
      }
      seenConnections.add(key);
      resolvedEdges.push({
        fromNodeId: node.id,
        toNodeId: connectionId,
      });
    }
  }

  for (const edge of fallbackEdges) {
    if (!nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId)) {
      continue;
    }
    const key = `${edge.fromNodeId}::${edge.toNodeId}`;
    if (seenConnections.has(key)) {
      continue;
    }
    seenConnections.add(key);
    resolvedEdges.push(edge);
  }

  return resolvedEdges;
}

function buildStraightEdgeGeometry(fromNode: PositionedGraphNode, toNode: PositionedGraphNode) {
  const fromSize = getNodeSize(fromNode.type);
  const toSize = getNodeSize(toNode.type);
  const dx = toNode.x - fromNode.x;
  const dy = toNode.y - fromNode.y;
  const distance = Math.hypot(dx, dy) || 1;
  const unitX = dx / distance;
  const unitY = dy / distance;

  return {
    x1: fromNode.x + unitX * (fromSize + 8),
    y1: fromNode.y + unitY * (fromSize + 8),
    x2: toNode.x - unitX * (toSize + 8),
    y2: toNode.y - unitY * (toSize + 8),
  };
}

function getSegmentOrientation(ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function segmentsIntersect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number
) {
  const abC = getSegmentOrientation(ax, ay, bx, by, cx, cy);
  const abD = getSegmentOrientation(ax, ay, bx, by, dx, dy);
  const cdA = getSegmentOrientation(cx, cy, dx, dy, ax, ay);
  const cdB = getSegmentOrientation(cx, cy, dx, dy, bx, by);

  return (abC > 0) !== (abD > 0) && (cdA > 0) !== (cdB > 0);
}

function relaxPositionedNodes(
  nodes: PositionedGraphNode[],
  edges: GraphEdge[],
  constraints: Map<string, NodeLayoutConstraint>,
  center: { x: number; y: number },
  centerNodeId: string | null
) {
  const mutableNodes = nodes.map((node) => ({
    ...node,
    vx: 0,
    vy: 0,
  }));
  const nodeMap = new Map(mutableNodes.map((node) => [node.id, node]));

  for (let iteration = 0; iteration < 140; iteration += 1) {
    const forces = new Map<string, { x: number; y: number }>();

    for (const node of mutableNodes) {
      if (node.id === centerNodeId) {
        continue;
      }

      const constraint = constraints.get(node.id);
      if (!constraint) {
        continue;
      }

      const force = { x: 0, y: 0 };
      const targetX = center.x + Math.cos(constraint.preferredAngle) * constraint.preferredRadius;
      const targetY = center.y + Math.sin(constraint.preferredAngle) * constraint.preferredRadius;
      force.x += (targetX - node.x) * 0.11;
      force.y += (targetY - node.y) * 0.11;

      const radiusVectorX = node.x - center.x;
      const radiusVectorY = node.y - center.y;
      const radius = Math.hypot(radiusVectorX, radiusVectorY) || 1;
      const radialX = radiusVectorX / radius;
      const radialY = radiusVectorY / radius;
      force.x += radialX * (constraint.preferredRadius - radius) * 0.14;
      force.y += radialY * (constraint.preferredRadius - radius) * 0.14;

      if (constraint.parentId) {
        const parent = nodeMap.get(constraint.parentId);
        if (parent) {
          const branchAngle = Math.atan2(parent.y - center.y, parent.x - center.x);
          const branchX = center.x + Math.cos(branchAngle) * constraint.preferredRadius;
          const branchY = center.y + Math.sin(branchAngle) * constraint.preferredRadius;
          force.x += (branchX - node.x) * 0.09;
          force.y += (branchY - node.y) * 0.09;
        }
      }

      forces.set(node.id, force);
    }

    for (let leftIndex = 0; leftIndex < mutableNodes.length; leftIndex += 1) {
      const leftNode = mutableNodes[leftIndex];
      if (leftNode.id === centerNodeId) {
        continue;
      }

      const leftConstraint = constraints.get(leftNode.id);
      if (!leftConstraint) {
        continue;
      }

      for (let rightIndex = leftIndex + 1; rightIndex < mutableNodes.length; rightIndex += 1) {
        const rightNode = mutableNodes[rightIndex];
        if (rightNode.id === centerNodeId) {
          continue;
        }

        const rightConstraint = constraints.get(rightNode.id);
        if (!rightConstraint) {
          continue;
        }

        const dx = rightNode.x - leftNode.x;
        const dy = rightNode.y - leftNode.y;
        const distance = Math.hypot(dx, dy) || 0.001;
        const threshold = Math.max(62, (leftConstraint.footprint + rightConstraint.footprint) * 0.52);

        if (distance >= threshold) {
          continue;
        }

        const push = (threshold - distance) * 0.24;
        const unitX = dx / distance;
        const unitY = dy / distance;
        const leftForce = forces.get(leftNode.id) ?? { x: 0, y: 0 };
        const rightForce = forces.get(rightNode.id) ?? { x: 0, y: 0 };
        leftForce.x -= unitX * push;
        leftForce.y -= unitY * push;
        rightForce.x += unitX * push;
        rightForce.y += unitY * push;
        forces.set(leftNode.id, leftForce);
        forces.set(rightNode.id, rightForce);
      }
    }

    for (let firstIndex = 0; firstIndex < edges.length; firstIndex += 1) {
      const firstEdge = edges[firstIndex];
      const firstFrom = nodeMap.get(firstEdge.fromNodeId);
      const firstTo = nodeMap.get(firstEdge.toNodeId);
      if (!firstFrom || !firstTo) {
        continue;
      }

      const firstGeometry = buildStraightEdgeGeometry(firstFrom, firstTo);

      for (let secondIndex = firstIndex + 1; secondIndex < edges.length; secondIndex += 1) {
        const secondEdge = edges[secondIndex];
        if (
          firstEdge.fromNodeId === secondEdge.fromNodeId ||
          firstEdge.fromNodeId === secondEdge.toNodeId ||
          firstEdge.toNodeId === secondEdge.fromNodeId ||
          firstEdge.toNodeId === secondEdge.toNodeId
        ) {
          continue;
        }

        const secondFrom = nodeMap.get(secondEdge.fromNodeId);
        const secondTo = nodeMap.get(secondEdge.toNodeId);
        if (!secondFrom || !secondTo) {
          continue;
        }

        const secondGeometry = buildStraightEdgeGeometry(secondFrom, secondTo);
        if (
          !segmentsIntersect(
            firstGeometry.x1,
            firstGeometry.y1,
            firstGeometry.x2,
            firstGeometry.y2,
            secondGeometry.x1,
            secondGeometry.y1,
            secondGeometry.x2,
            secondGeometry.y2
          )
        ) {
          continue;
        }

        const firstOuter =
          Math.hypot(firstFrom.x - center.x, firstFrom.y - center.y) >= Math.hypot(firstTo.x - center.x, firstTo.y - center.y)
            ? firstFrom
            : firstTo;
        const secondOuter =
          Math.hypot(secondFrom.x - center.x, secondFrom.y - center.y) >= Math.hypot(secondTo.x - center.x, secondTo.y - center.y)
            ? secondFrom
            : secondTo;

        if (firstOuter.id === centerNodeId || secondOuter.id === centerNodeId) {
          continue;
        }

        const dx = secondOuter.x - firstOuter.x;
        const dy = secondOuter.y - firstOuter.y;
        const distance = Math.hypot(dx, dy) || 0.001;
        const unitX = dx / distance;
        const unitY = dy / distance;
        const firstForce = forces.get(firstOuter.id) ?? { x: 0, y: 0 };
        const secondForce = forces.get(secondOuter.id) ?? { x: 0, y: 0 };
        firstForce.x -= unitX * 9;
        firstForce.y -= unitY * 9;
        secondForce.x += unitX * 9;
        secondForce.y += unitY * 9;
        forces.set(firstOuter.id, firstForce);
        forces.set(secondOuter.id, secondForce);
      }
    }

    for (const node of mutableNodes) {
      if (node.id === centerNodeId) {
        node.x = center.x;
        node.y = center.y;
        node.vx = 0;
        node.vy = 0;
        continue;
      }

      const constraint = constraints.get(node.id);
      const force = forces.get(node.id);
      if (!constraint || !force) {
        continue;
      }

      node.vx = clamp((node.vx + force.x) * 0.72, -18, 18);
      node.vy = clamp((node.vy + force.y) * 0.72, -18, 18);
      node.x += node.vx;
      node.y += node.vy;

      const angle = Math.atan2(node.y - center.y, node.x - center.x);
      const radius = Math.hypot(node.x - center.x, node.y - center.y) || 1;
      const boundedRadius = clamp(
        radius,
        constraint.preferredRadius - getNodeBandAmplitude(node.type),
        constraint.preferredRadius + getNodeBandAmplitude(node.type)
      );
      node.x = clamp(center.x + Math.cos(angle) * boundedRadius, 72, GRAPH_CANVAS_SIZE - 72);
      node.y = clamp(center.y + Math.sin(angle) * boundedRadius, 72, GRAPH_CANVAS_SIZE - 72);
      node.angle = angle;
    }
  }

  return mutableNodes.map((node) => ({
    ...node,
    angle: node.id === centerNodeId ? -Math.PI / 2 : Math.atan2(node.y - center.y, node.x - center.x),
  }));
}

function buildRoutedEdges(nodes: PositionedGraphNode[], edges: GraphEdge[]): RoutedGraphEdge[] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const fromGroups = new Map<string, RoutedGraphEdge[]>();
  const toGroups = new Map<string, RoutedGraphEdge[]>();
  const routedEdges = edges.map((edge, index) => ({
    ...edge,
    key: `${edge.fromNodeId}-${edge.toNodeId}-${index}`,
    fromLane: 0,
    fromLaneCount: 1,
    toLane: 0,
    toLaneCount: 1,
    orbitOffset: 0,
  }));

  for (const edge of routedEdges) {
    const fromGroup = fromGroups.get(edge.fromNodeId) ?? [];
    fromGroup.push(edge);
    fromGroups.set(edge.fromNodeId, fromGroup);

    const toGroup = toGroups.get(edge.toNodeId) ?? [];
    toGroup.push(edge);
    toGroups.set(edge.toNodeId, toGroup);
  }

  const applyLaneAssignments = (
    groups: Map<string, RoutedGraphEdge[]>,
    selector: (edge: RoutedGraphEdge) => string,
    assign: (edge: RoutedGraphEdge, lane: number, count: number) => void
  ) => {
    for (const [nodeId, group] of groups) {
      const node = nodeMap.get(nodeId);
      if (!node) {
        continue;
      }

      const sorted = [...group].sort((left, right) => {
        const leftNode = nodeMap.get(selector(left));
        const rightNode = nodeMap.get(selector(right));
        const leftAngle = leftNode ? normalizeAngle(Math.atan2(leftNode.y - node.y, leftNode.x - node.x)) : 0;
        const rightAngle = rightNode ? normalizeAngle(Math.atan2(rightNode.y - node.y, rightNode.x - node.x)) : 0;
        return leftAngle - rightAngle;
      });

      sorted.forEach((edge, index) => {
        assign(edge, index, sorted.length);
      });
    }
  };

  applyLaneAssignments(
    fromGroups,
    (edge) => edge.toNodeId,
    (edge, lane, count) => {
      edge.fromLane = lane;
      edge.fromLaneCount = count;
    }
  );

  applyLaneAssignments(
    toGroups,
    (edge) => edge.fromNodeId,
    (edge, lane, count) => {
      edge.toLane = lane;
      edge.toLaneCount = count;
    }
  );

  return routedEdges.map((edge) => ({
    ...edge,
    orbitOffset:
      (Math.max(edge.fromLaneCount, edge.toLaneCount) - 1) * 16 +
      Math.abs(edge.fromLane - (edge.fromLaneCount - 1) / 2) * 12 +
      Math.abs(edge.toLane - (edge.toLaneCount - 1) / 2) * 12,
  }));
}

function buildSmartNodeLayout(nodes: GraphNode[], edges: GraphEdge[]): GraphLayout {
  if (nodes.length === 0) {
    return {
      width: GRAPH_CANVAS_SIZE,
      height: GRAPH_CANVAS_SIZE,
      center: { x: GRAPH_CENTER, y: GRAPH_CENTER },
      nodes: [],
    };
  }

  const centerNode = getCenterGraphNode(nodes);
  const center = { x: GRAPH_CENTER, y: GRAPH_CENTER };
  const positions = new Map<string, PositionedGraphNode>();
  const positionedAngles = new Map<string, number>();
  const constraints = new Map<string, NodeLayoutConstraint>();
  const adjacency = new Map<string, Set<string>>();
  const branchRootByNodeId = new Map<string, string>();
  const branchAngleByRootId = new Map<string, number>();
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  for (const node of nodes) {
    adjacency.set(node.id, new Set(node.connections));
  }
  for (const edge of edges) {
    adjacency.get(edge.fromNodeId)?.add(edge.toNodeId);
    adjacency.get(edge.toNodeId)?.add(edge.fromNodeId);
  }

  if (centerNode) {
    positions.set(centerNode.id, {
      ...centerNode,
      x: center.x,
      y: center.y,
      angle: -Math.PI / 2,
      level: 0,
      ringIndex: 0,
      ringCount: 1,
    });
    positionedAngles.set(centerNode.id, -Math.PI / 2);
  }

  const nodesByType = new Map<Exclude<GraphNode["type"], "seed">, GraphNode[]>();
  for (const type of RING_ORDER) {
    nodesByType.set(type, []);
  }

  for (const node of nodes) {
    if (node.id === centerNode?.id || node.type === "seed") {
      continue;
    }
    const group = nodesByType.get(node.type as Exclude<GraphNode["type"], "seed">);
    if (group) {
      group.push(node);
    }
  }

  for (const type of RING_ORDER) {
    const groupNodes = nodesByType.get(type) ?? [];
    const sortedNodes = [...groupNodes].sort((left, right) => {
      const typeDelta = getNodeTypeSortWeight(left.type) - getNodeTypeSortWeight(right.type);
      if (typeDelta !== 0) {
        return typeDelta;
      }
      return left.label.localeCompare(right.label);
    });

    if (sortedNodes.length === 0) {
      continue;
    }

    const currentOuterRadius = Array.from(positions.values())
      .filter((node) => node.type !== "seed")
      .reduce((largest, node) => Math.max(largest, Math.hypot(node.x - center.x, node.y - center.y)), 0);
    const radius = getRingRadius(type, sortedNodes, currentOuterRadius);
    const level = getNodeLevel(type);
    const angleStep = FULL_TURN / sortedNodes.length;
    const sortedNodeIds = new Set(sortedNodes.map((node) => node.id));
    const sameLevelComponentByNodeId = new Map<string, string>();
    let componentCounter = 0;

    for (const node of sortedNodes) {
      if (sameLevelComponentByNodeId.has(node.id)) {
        continue;
      }

      const componentId = `${type}-component-${componentCounter}`;
      componentCounter += 1;
      const queue = [node.id];
      sameLevelComponentByNodeId.set(node.id, componentId);

      while (queue.length > 0) {
        const currentId = queue.shift();
        if (!currentId) {
          continue;
        }

        for (const neighborId of adjacency.get(currentId) ?? []) {
          if (!sortedNodeIds.has(neighborId) || sameLevelComponentByNodeId.has(neighborId)) {
            continue;
          }
          sameLevelComponentByNodeId.set(neighborId, componentId);
          queue.push(neighborId);
        }
      }
    }

    const preliminaryCandidates = sortedNodes.map((node, index) => {
      const connectedPositionedNodes = Array.from(adjacency.get(node.id) ?? [])
        .map((connectionId) => positions.get(connectionId))
        .filter((connection): connection is PositionedGraphNode => Boolean(connection));
      const lowerLevelConnections = connectedPositionedNodes
        .filter((connection) => connection.level < level)
        .sort((left, right) => right.level - left.level || left.angle - right.angle);
      const preferredAnchors = lowerLevelConnections.length > 0 ? lowerLevelConnections : connectedPositionedNodes;
      const nonSeedAnchors = preferredAnchors.filter((connection) => connection.type !== "seed");
      const primaryAnchor =
        (nonSeedAnchors.length > 0 ? nonSeedAnchors[0] : lowerLevelConnections.find((connection) => connection.type !== "seed")) ??
        (type === "platform" ? null : lowerLevelConnections[0] ?? null);
      const branchVotes = (nonSeedAnchors.length > 0 ? nonSeedAnchors : preferredAnchors)
        .map((connection) => branchRootByNodeId.get(connection.id) ?? (connection.type === "platform" ? connection.id : null))
        .filter((value): value is string => Boolean(value));
      const branchCounts = new Map<string, number>();
      branchVotes.forEach((value) => branchCounts.set(value, (branchCounts.get(value) ?? 0) + 1));
      const branchRootId =
        type === "platform"
          ? node.id
          : Array.from(branchCounts.entries()).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ??
            null;
      const branchAnchorAngle = branchRootId ? branchAngleByRootId.get(branchRootId) ?? null : null;
      const directAnchorAngles = (nonSeedAnchors.length > 0 ? nonSeedAnchors : preferredAnchors).map((connection) => connection.angle);
      const localAngle = averageAngle(directAnchorAngles);
      const branchSpread =
        type === "platform"
          ? Math.PI
          : type === "username"
            ? 0.46
            : type === "identity"
              ? 0.34
              : 0.28;
      const preferredAngle =
        type === "platform"
          ? normalizeAngle(-Math.PI / 2 + (RING_ANGLE_OFFSET[type] ?? 0) + index * angleStep)
          : branchAnchorAngle != null
            ? normalizeAngle(
                branchAnchorAngle +
                  clamp(
                    localAngle != null ? getRelativeAngle(localAngle, branchAnchorAngle) : 0,
                    -branchSpread,
                    branchSpread
                  )
              )
            : localAngle ?? (-Math.PI / 2 + (RING_ANGLE_OFFSET[type] ?? 0) + index * angleStep);
      return {
        node,
        preferredAngle,
        footprint: getNodeFootprint(node.type, node.label) + RING_PADDING_BY_TYPE[type],
        clusterKey: branchRootId ? `branch:${branchRootId}` : primaryAnchor?.id ?? `solo:${node.id}`,
        primaryParentId: primaryAnchor?.id ?? null,
        branchRootId,
        anchorLevel: primaryAnchor?.level ?? -1,
        componentId: sameLevelComponentByNodeId.get(node.id) ?? `${type}-component-fallback-${index}`,
      };
    });

    const componentSettings = new Map<string, { parentId: string | null; preferredAngle: number | null }>();
    const preliminaryByComponent = new Map<string, typeof preliminaryCandidates>();

    for (const candidate of preliminaryCandidates) {
      const existing = preliminaryByComponent.get(candidate.componentId) ?? [];
      existing.push(candidate);
      preliminaryByComponent.set(candidate.componentId, existing);
    }

    for (const [componentId, componentCandidates] of preliminaryByComponent) {
      const anchoredCandidates = componentCandidates
        .filter((candidate) => candidate.primaryParentId)
        .sort((left, right) => right.anchorLevel - left.anchorLevel);
      const parentId = anchoredCandidates[0]?.primaryParentId ?? null;
      const preferredAngle =
        averageAngle(
          (anchoredCandidates.length > 0 ? anchoredCandidates : componentCandidates).map((candidate) => candidate.preferredAngle)
        ) ?? null;
      componentSettings.set(componentId, {
        parentId,
        preferredAngle,
      });
    }

    const placementCandidates: RingPlacementCandidate[] = preliminaryCandidates.map((candidate) => {
      const componentSetting = componentSettings.get(candidate.componentId);
      const sharedParentId = componentSetting?.parentId ?? candidate.primaryParentId;
      const sharedAngle = componentSetting?.preferredAngle ?? candidate.preferredAngle;
      return {
        node: candidate.node,
        preferredAngle: sharedAngle,
        footprint: candidate.footprint,
        clusterKey: candidate.branchRootId ? `branch:${candidate.branchRootId}` : sharedParentId ? `parent:${sharedParentId}` : `component:${candidate.componentId}`,
        primaryParentId: sharedParentId,
        branchRootId: candidate.branchRootId,
      };
    });

    const clusterMap = new Map<string, RingPlacementCandidate[]>();
    for (const candidate of placementCandidates) {
      const existing = clusterMap.get(candidate.clusterKey) ?? [];
      existing.push(candidate);
      clusterMap.set(candidate.clusterKey, existing);
    }

    const clusters: RingPlacementCluster[] = Array.from(clusterMap.entries())
      .map(([key, clusterNodes]) => ({
        key,
        preferredAngle: averageAngle(clusterNodes.map((candidate) => candidate.preferredAngle)) ?? clusterNodes[0].preferredAngle,
        span: getClusterSpan(radius, type, clusterNodes),
        nodes: clusterNodes,
      }))
      .sort((left, right) => normalizeAngle(left.preferredAngle) - normalizeAngle(right.preferredAngle));

    const clusterCenters = resolveClusterCenters(
      clusters.map((cluster) => cluster.preferredAngle),
      clusters.map((cluster) => cluster.span),
      getClusterGap(type)
    );

    clusters.forEach((cluster, clusterIndex) => {
      const centerAngle = clusterCenters[clusterIndex] ?? cluster.preferredAngle;
      const nodePlacements = buildClusterAngles(centerAngle, radius, type, cluster.nodes);

      nodePlacements.forEach(({ candidate, angle, radiusOffset }, index) => {
        const nodeRadius = radius + radiusOffset;
        positions.set(candidate.node.id, {
          ...candidate.node,
          x: center.x + Math.cos(angle) * nodeRadius,
          y: center.y + Math.sin(angle) * nodeRadius,
          angle,
          level,
          ringIndex: index,
          ringCount: sortedNodes.length,
        });
        constraints.set(candidate.node.id, {
          preferredAngle: angle,
          preferredRadius: nodeRadius,
          footprint: candidate.footprint,
          parentId: candidate.primaryParentId,
          branchRootId: candidate.branchRootId,
          level,
        });
        positionedAngles.set(candidate.node.id, angle);
        if (candidate.branchRootId) {
          branchRootByNodeId.set(candidate.node.id, candidate.branchRootId);
        }
        if (type === "platform") {
          branchRootByNodeId.set(candidate.node.id, candidate.node.id);
          branchAngleByRootId.set(candidate.node.id, angle);
        }
      });
    });

    const placedRingNodes = sortedNodes
      .map((node) => positions.get(node.id))
      .filter((node): node is PositionedGraphNode => Boolean(node))
      .sort((left, right) => normalizeAngle(left.angle) - normalizeAngle(right.angle));

    placedRingNodes.forEach((node, index) => {
      positions.set(node.id, {
        ...node,
        ringIndex: index,
        ringCount: placedRingNodes.length,
      });
    });
  }

  const relaxedNodes = relaxPositionedNodes(
    nodes.map((node) => {
      const positioned = positions.get(node.id);
      return (
        positioned ?? {
          ...node,
          x: center.x,
          y: center.y,
          angle: -Math.PI / 2,
          level: node.type === "seed" ? 0 : 4,
          ringIndex: 0,
          ringCount: 1,
        }
      );
    }),
    edges,
    constraints,
    center,
    centerNode?.id ?? null
  );
  const relaxedMap = new Map(relaxedNodes.map((node) => [node.id, node]));

  for (const type of RING_ORDER) {
    const ringNodes = relaxedNodes
      .filter((node) => node.type === type)
      .sort((left, right) => normalizeAngle(left.angle) - normalizeAngle(right.angle));
    ringNodes.forEach((node, index) => {
      relaxedMap.set(node.id, {
        ...node,
        ringIndex: index,
        ringCount: ringNodes.length,
      });
    });
  }

  return {
    width: GRAPH_CANVAS_SIZE,
    height: GRAPH_CANVAS_SIZE,
    center,
    nodes: nodes.map((node) => {
      const positioned = relaxedMap.get(node.id);
      return (
        positioned ?? {
          ...node,
          x: center.x,
          y: center.y,
          angle: -Math.PI / 2,
          level: node.type === "seed" ? 0 : 4,
          ringIndex: 0,
          ringCount: 1,
        }
      );
    }),
  };
}

function getNodeLabelStyle(node: PositionedGraphNode, size: number): CSSProperties {
  const labelWidth = estimateLabelWidth(node.type, node.label);
  const stagger = node.ringCount > 8 ? ((node.ringIndex % 3) - 1) * 18 : node.ringCount > 4 ? (node.ringIndex % 2) * 18 : 0;
  const radialOffset = size + 34 + Math.abs(stagger);
  const offsetX = Math.cos(node.angle) * radialOffset;
  const offsetY = Math.sin(node.angle) * radialOffset;
  const tangentX = -Math.sin(node.angle) * stagger;
  const tangentY = Math.cos(node.angle) * stagger;
  const horizontal = Math.cos(node.angle);
  const vertical = Math.sin(node.angle);

  return {
    left: "50%",
    top: "50%",
    width: labelWidth,
    maxWidth: labelWidth,
    transform: `translate(${offsetX + tangentX - labelWidth / 2}px, ${offsetY + tangentY - 16}px)`,
    textAlign: horizontal > 0.32 ? "left" : horizontal < -0.32 ? "right" : "center",
    lineHeight: 1.15,
    whiteSpace: "normal",
    pointerEvents: "none",
    opacity: Math.abs(vertical) > 0.85 ? 0.95 : 1,
  };
}

function ConnectionBanner({ status }: { status: RealtimeConnectionStatus }) {
  if (status === "connected" || status === "idle") {
    return null;
  }

  const text =
    status === "offline"
      ? "Offline mode enabled. Identity graph updates are paused."
      : status === "reconnecting"
        ? "Reconnecting to graph updates..."
        : status === "connecting"
          ? "Connecting to graph updates..."
          : "Realtime graph updates unavailable. Auto-retry is active.";

  return (
    <div className="mx-auto max-w-[1600px] px-4 md:px-8 lg:px-12 pt-3">
      <div className="hand-drawn-card px-4 py-2" style={{ backgroundColor: "rgba(74, 111, 165, 0.12)" }}>
        <p style={{ fontFamily: "'Patrick Hand', cursive", color: "#2b4e7e" }}>{text}</p>
      </div>
    </div>
  );
}

function getNodeColor(type: GraphNode["type"]) {
  switch (type) {
    case "seed":
      return COLORS.purple;
    case "platform":
      return COLORS.blue;
    case "username":
      return COLORS.green;
    case "identity":
      return COLORS.orange;
    case "target":
      return COLORS.red;
    default:
      return COLORS.text;
  }
}

function getNodeSize(type: GraphNode["type"]) {
  switch (type) {
    case "seed":
      return 24;
    case "platform":
      return 16;
    case "username":
      return 14;
    case "identity":
      return 16;
    case "target":
      return 18;
    default:
      return 12;
  }
}

function ToggleButton({
  label,
  enabled,
  onToggle,
  color,
}: {
  label: string;
  enabled: boolean;
  onToggle: () => void;
  color: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between px-3 py-2 transition-colors"
      style={{
        border: "1.5px dashed rgba(0,0,0,0.1)",
        borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
        backgroundColor: enabled ? "rgba(0,0,0,0.02)" : "transparent",
      }}
    >
      <div className="flex items-center gap-3">
        <div className="w-3 h-3 rounded-full border border-black/20" style={{ backgroundColor: enabled ? color : "transparent" }} />
        <span style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.text, opacity: enabled ? 1 : 0.6 }}>{label}</span>
      </div>
      {enabled ? <Eye className="w-4 h-4" style={{ color }} /> : <EyeOff className="w-4 h-4" style={{ color: COLORS.textSec }} />}
    </button>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-2.5 h-2.5 rounded-full border border-black/20" style={{ backgroundColor: color }} />
      <span style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.text, fontSize: "15px" }}>{label}</span>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-dashed border-black/10 pb-2">
      <div className="text-sm mb-1" style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec }}>
        {label}
      </div>
      <div className="text-lg" style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, color: COLORS.text }}>
        {value}
      </div>
    </div>
  );
}

export default function IdentityGraph() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { clearActiveScan } = useScanContext();
  const scanId = useRequireScan();
  const graphViewportRef = useRef<HTMLDivElement | null>(null);
  const transformRef = useRef<GraphTransform>({ x: 0, y: 0, scale: 1 });
  const panStateRef = useRef<{
    pointerId: number | null;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  }>({
    pointerId: null,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    moved: false,
  });
  const panFrameRef = useRef<number | null>(null);
  const pendingPanTransformRef = useRef<GraphTransform | null>(null);

  const [showPlatforms, setShowPlatforms] = useState(true);
  const [showIdentity, setShowIdentity] = useState(true);
  const [showTargets, setShowTargets] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [graphTransform, setGraphTransform] = useState<GraphTransform>({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [animationStep, setAnimationStep] = useState(0);

  const filters = useMemo(
    () => ({
      includePlatforms: showPlatforms,
      includeIdentity: showIdentity,
      includeTargets: showTargets,
    }),
    [showPlatforms, showIdentity, showTargets]
  );

  const scanQuery = useScanStatusQuery(scanId);
  const graphQuery = useIdentityGraphQuery(scanId, filters);

  const graphNodes = (graphQuery.data?.nodes ?? []) as GraphNode[];
  const graphEdges = (graphQuery.data?.edges ?? []) as GraphEdge[];
  const selectedNodeQuery = useIdentityGraphNodeQuery(scanId, selectedNodeId);
  const preparedGraph = useMemo(() => prepareGraphData(graphNodes, graphEdges), [graphEdges, graphNodes]);
  const resolvedEdges = useMemo(() => buildResolvedEdges(preparedGraph.nodes, preparedGraph.edges), [preparedGraph.edges, preparedGraph.nodes]);
  const graphLayout = useMemo(() => buildSmartNodeLayout(preparedGraph.nodes, resolvedEdges), [preparedGraph.nodes, resolvedEdges]);
  const routedEdges = useMemo(() => buildRoutedEdges(graphLayout.nodes, resolvedEdges), [graphLayout.nodes, resolvedEdges]);

  useEffect(() => {
    const element = graphViewportRef.current;
    if (!element) {
      return;
    }

    const updateSize = () => {
      setViewportSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    transformRef.current = graphTransform;
  }, [graphTransform]);

  useEffect(() => {
    return () => {
      if (panFrameRef.current != null) {
        window.cancelAnimationFrame(panFrameRef.current);
      }
    };
  }, []);

  const realtimeStatus = useRealtimeSubscription({
    scanId,
    enabled: Boolean(scanId),
    channels: ["identity.graph", "scans.lifecycle"],
    onEvent: (event) => {
      if (!scanId || event.scanId !== scanId) {
        return;
      }

      if (event.event.startsWith("identity.graph")) {
        void queryClient.invalidateQueries({ queryKey: dataReaperQueryKeys.identityGraph(scanId, filters) });
      }

      if (event.event.startsWith("scans.lifecycle")) {
        void queryClient.invalidateQueries({ queryKey: dataReaperQueryKeys.scan(scanId) });
      }
    },
  });

  useEffect(() => {
    const maxStep = graphNodes.reduce((highest, node) => Math.max(highest, node.revealStep ?? 0), 0);
    setAnimationStep(0);

    if (graphNodes.length === 0) {
      return;
    }

    let currentStep = 0;
    const timer = window.setInterval(() => {
      currentStep += 1;
      setAnimationStep(currentStep);
      if (currentStep > maxStep + 1) {
        window.clearInterval(timer);
      }
    }, 420);

    return () => {
      window.clearInterval(timer);
    };
  }, [graphNodes]);

  if (!scanId) {
    return null;
  }

  const visibleNodes = graphLayout.nodes.filter((node) => (node.revealStep ?? 0) <= animationStep);
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const edges = routedEdges.filter(
    (edge) => visibleNodeIds.has(edge.fromNodeId) && visibleNodeIds.has(edge.toNodeId)
  );

  const selectedNode = selectedNodeQuery.data ?? visibleNodes.find((node) => node.id === selectedNodeId) ?? null;
  const baseOffsetX = viewportSize.width > 0 ? (viewportSize.width - graphLayout.width) / 2 : 0;
  const baseOffsetY = viewportSize.height > 0 ? (viewportSize.height - graphLayout.height) / 2 : 0;

  const isConnectedToHovered = (nodeId: string) => {
    if (!hoveredNodeId) {
      return true;
    }
    if (hoveredNodeId === nodeId) {
      return true;
    }

    const hovered = visibleNodes.find((node) => node.id === hoveredNodeId);
    if (!hovered) {
      return true;
    }

    if (hovered.connections.includes(nodeId)) {
      return true;
    }

    const current = visibleNodes.find((node) => node.id === nodeId);
    return Boolean(current?.connections.includes(hoveredNodeId));
  };

  const updateZoom = (nextScale: number, anchorX: number, anchorY: number) => {
    setGraphTransform((current) => {
      const clampedScale = Math.max(0.25, Math.min(nextScale, 4));
      const currentRenderedX = baseOffsetX + current.x;
      const currentRenderedY = baseOffsetY + current.y;
      const nextRenderedX = anchorX - (anchorX - currentRenderedX) * (clampedScale / current.scale);
      const nextRenderedY = anchorY - (anchorY - currentRenderedY) * (clampedScale / current.scale);
      return {
        scale: clampedScale,
        x: nextRenderedX - baseOffsetX,
        y: nextRenderedY - baseOffsetY,
      };
    });
  };

  const handleCanvasWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const anchorX = event.clientX - rect.left;
    const anchorY = event.clientY - rect.top;
    const zoomFactor = event.deltaY < 0 ? 1.12 : 0.9;
    updateZoom(transformRef.current.scale * zoomFactor, anchorX, anchorY);
  };

  const handleCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest("[data-graph-node='true']") || target.closest("[data-graph-control='true']")) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: transformRef.current.x,
      originY: transformRef.current.y,
      moved: false,
    };
    setIsPanning(true);
  };

  const handleCanvasPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (panStateRef.current.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - panStateRef.current.startX;
    const deltaY = event.clientY - panStateRef.current.startY;
    if (!panStateRef.current.moved && Math.hypot(deltaX, deltaY) > 3) {
      panStateRef.current.moved = true;
    }

    const nextTransform = {
      ...transformRef.current,
      x: panStateRef.current.originX + deltaX,
      y: panStateRef.current.originY + deltaY,
    };
    pendingPanTransformRef.current = nextTransform;

    if (panFrameRef.current == null) {
      panFrameRef.current = window.requestAnimationFrame(() => {
        panFrameRef.current = null;
        const pendingTransform = pendingPanTransformRef.current;
        if (!pendingTransform) {
          return;
        }
        pendingPanTransformRef.current = null;
        setGraphTransform(pendingTransform);
      });
    }
  };

  const stopPanning = (event?: ReactPointerEvent<HTMLDivElement>) => {
    if (event && panStateRef.current.pointerId !== event.pointerId) {
      return;
    }

    if (event?.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (panFrameRef.current != null) {
      window.cancelAnimationFrame(panFrameRef.current);
      panFrameRef.current = null;
    }

    const pendingTransform = pendingPanTransformRef.current;
    if (pendingTransform) {
      pendingPanTransformRef.current = null;
      setGraphTransform(pendingTransform);
    }

    panStateRef.current.pointerId = null;
    panStateRef.current.moved = false;
    setIsPanning(false);
  };

  return (
    <div className="min-h-screen relative w-full overflow-x-hidden" style={{ backgroundColor: COLORS.bg }}>
      <PressureFilter />
      <ConnectionBanner status={realtimeStatus} />

      <nav
        className="sticky top-0 z-50 pt-4 pb-3 px-6 md:px-12 lg:px-16 flex items-center justify-between backdrop-blur-sm"
        style={{ backgroundColor: "rgba(245, 243, 239, 0.85)", borderBottom: "1.5px dashed rgba(0,0,0,0.15)" }}
      >
        <div className="max-w-[1600px] w-full mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}> 
            <AnimatedDataReaperLogo imageStyle={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.15))" }} />
            <PressureText as="span" className="text-3xl tracking-tight" style={{ fontFamily: "'Dancing Script', cursive", fontWeight: 700 }}>
              DataReaper
            </PressureText>
          </div>

          <div className="hidden md:flex items-center gap-8">
            <button 
              onClick={() => navigate("/command-center")} 
              className="text-xl pencil-text transition-colors opacity-60 hover:opacity-100"
              data-reaper-expression="thinking"
              data-reaper-phrases="Dashboard view. Checking the bird's eye view.||Back to the command deck."
            >
              Dashboard
            </button>
            <button 
              onClick={() => navigate("/war-room")} 
              className="text-xl pencil-text transition-colors opacity-60 hover:opacity-100"
              data-reaper-expression="thinking"
              data-reaper-phrases="Tactic change. Let's go to the War Room.||Disputes are waiting. Let's get aggressive."
            >
              War Room
            </button>
            <button 
              className="text-xl pencil-text transition-colors opacity-100 hover:opacity-70"
              data-reaper-expression="happy"
              data-reaper-phrases="Behold the web of digital decay. It's beautiful.||I see the threads they try to hide.||Connecting the digital dots."
            >
              Identity Graph
            </button>
          </div>

          <div className="flex items-center gap-3">
            <PressureText as="span" className="text-base hidden lg:block" style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec }}>
              {scanQuery.data?.status ? `Lifecycle: ${scanQuery.data.status}` : "Loading scan"}
            </PressureText>
            <button
              type="button"
              className="hand-drawn-button px-3 py-2"
              onClick={() => {
                clearActiveScan();
                navigate("/onboarding");
              }}
              data-reaper-expression="happy"
              data-reaper-phrases="Time for a fresh sequence. New data awaits.||Resetting the graph for a new target sequence."
            >
              Start New Scan
            </button>
          </div>
        </div>
      </nav>

      <div className="flex h-[calc(100vh-73px)]">
        <motion.div
          initial={{ x: -18, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          className="w-64 p-5 hand-drawn-card"
          style={{
            backgroundColor: COLORS.card,
            borderRight: "1.5px dashed rgba(0,0,0,0.15)",
            borderRadius: "0",
          }}
        >
          <PressureText as="h3" className="text-2xl mb-5" style={{ fontFamily: "'Caveat', cursive" }}>
            Graph Controls
          </PressureText>

          <div className="space-y-5">
            <motion.button
              type="button"
              onClick={() => setAnimationStep(0)}
              whileHover={{ scale: 1.02, rotate: -0.5 }}
              whileTap={{ scale: 0.98 }}
              className="w-full flex items-center justify-center gap-2 py-3 hand-drawn-button text-lg"
            >
              <Play className="w-4 h-4" />
              <PressureText className="paper-text">Replay Animation</PressureText>
            </motion.button>

            <div>
              <h4 className="text-base mb-3 flex items-center gap-2" style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec }}>
                <Filter className="w-4 h-4" />
                Filter Nodes
              </h4>
              <div 
                className="space-y-2"
                data-reaper-expression="thinking"
                data-reaper-phrases="Pruning the tree? Or just narrowing the search?||Filters help, but the data never lies.||Selective vision. Sometimes less is more."
              >
                <ToggleButton label="Platforms" enabled={showPlatforms} onToggle={() => setShowPlatforms((value) => !value)} color={COLORS.blue} />
                <ToggleButton label="Identity Data" enabled={showIdentity} onToggle={() => setShowIdentity((value) => !value)} color={COLORS.orange} />
                <ToggleButton label="Data Brokers" enabled={showTargets} onToggle={() => setShowTargets((value) => !value)} color={COLORS.red} />
              </div>
            </div>

            <div className="pt-4" style={{ borderTop: "1.5px dashed rgba(0,0,0,0.12)" }}>
              <h4 className="text-base mb-3" style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec }}>
                Legend
              </h4>
              <div 
                className="space-y-2 text-sm"
                data-reaper-expression="happy"
                data-reaper-phrases="Color coding the victims. How organized of you.||The rainbow of digital exposure.||I like the red ones. They're tasty."
              >
                <LegendItem color={COLORS.purple} label="Seed" />
                <LegendItem color={COLORS.blue} label="Platform" />
                <LegendItem color={COLORS.green} label="Username" />
                <LegendItem color={COLORS.orange} label="Identity" />
                <LegendItem color={COLORS.red} label="Broker Target" />
              </div>
            </div>
          </div>
        </motion.div>

        <div 
          className="flex-1 relative overflow-hidden"
          ref={graphViewportRef}
          onWheel={handleCanvasWheel}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={stopPanning}
          onPointerCancel={stopPanning}
          onLostPointerCapture={stopPanning}
          data-reaper-expression="thinking"
          data-reaper-phrases="The web is expanding. Every node is a trace.||I'm weaving the trap. There's no escape from the graph.||Look at all these connections. They thought they were private!||Data relationships. My favorite kind of spiderweb."
          style={{
            backgroundColor: COLORS.paper,
            touchAction: "none",
            cursor: isPanning ? "grabbing" : "grab",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
        >
          <div
            className="absolute inset-0 opacity-15"
            style={{
              backgroundImage:
                "linear-gradient(rgba(74, 111, 165, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(74, 111, 165, 0.08) 1px, transparent 1px)",
              backgroundSize: "50px 50px",
              filter: "url(#pencil-sketch)",
            }}
          />

          <div
            className="absolute top-5 right-5 z-20 flex items-center gap-2"
            data-graph-control="true"
          >
            <button
              type="button"
              className="hand-drawn-button px-3 py-2"
              onClick={() => updateZoom(transformRef.current.scale * 1.2, viewportSize.width / 2, viewportSize.height / 2)}
            >
              +
            </button>
            <button
              type="button"
              className="hand-drawn-button px-3 py-2"
              onClick={() => updateZoom(transformRef.current.scale / 1.2, viewportSize.width / 2, viewportSize.height / 2)}
            >
              -
            </button>
            <button
              type="button"
              className="hand-drawn-button px-3 py-2"
              onClick={() => {
                setGraphTransform({
                  x: 0,
                  y: 0,
                  scale: 1,
                });
              }}
            >
              Reset View
            </button>
          </div>

          <div
            className="absolute origin-top-left"
            style={{
              width: graphLayout.width,
              height: graphLayout.height,
              left: 0,
              top: 0,
              transform: `translate(${baseOffsetX + graphTransform.x}px, ${baseOffsetY + graphTransform.y}px) scale(${graphTransform.scale})`,
              willChange: "transform",
            }}
          >
            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ filter: "url(#pencil-sketch)" }}>
              {edges.map((edge) => {
                const fromNode = visibleNodes.find((node) => node.id === edge.fromNodeId);
                const toNode = visibleNodes.find((node) => node.id === edge.toNodeId);

                if (!fromNode || !toNode) {
                  return null;
                }

                const highlighted = hoveredNodeId ? edge.fromNodeId === hoveredNodeId || edge.toNodeId === hoveredNodeId : false;
                const geometry = buildStraightEdgeGeometry(fromNode, toNode);

                return (
                  <motion.line
                    key={edge.key}
                    x1={geometry.x1}
                    y1={geometry.y1}
                    x2={geometry.x2}
                    y2={geometry.y2}
                    stroke={getNodeColor(fromNode.type)}
                    strokeWidth={highlighted ? 2.4 : 1.2}
                    strokeLinecap="round"
                    strokeDasharray={highlighted ? "none" : "6,4"}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: highlighted ? 0.9 : 0.35 }}
                  />
                );
              })}
            </svg>

            <div className="absolute inset-0">
              <AnimatePresence>
                {visibleNodes.map((node) => {
                  const color = getNodeColor(node.type);
                  const size = getNodeSize(node.type);
                  const connected = isConnectedToHovered(node.id);

                  return (
                    <motion.div
                      key={node.id}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: connected ? 1 : 0.6, opacity: connected ? 1 : 0.25 }}
                      exit={{ scale: 0, opacity: 0 }}
                      className="absolute cursor-pointer"
                      style={{ left: node.x, top: node.y, transform: "translate(-50%, -50%)" }}
                      data-graph-node="true"
                      onClick={() => setSelectedNodeId(node.id)}
                      onMouseEnter={() => setHoveredNodeId(node.id)}
                      onMouseLeave={() => setHoveredNodeId(null)}
                    >
                      <motion.div
                        className="rounded-full relative"
                        style={{
                          width: size * 2,
                          height: size * 2,
                          backgroundColor: COLORS.paper,
                          border: selectedNode?.id === node.id ? `3.4px solid ${color}` : `2.4px solid ${color}`,
                          boxShadow: selectedNode?.id === node.id ? `0 0 12px ${color}88` : "none",
                        }}
                      >
                        <motion.div
                          className="absolute rounded-full"
                          style={{
                            width: size * 0.85,
                            height: size * 0.85,
                            backgroundColor: color,
                            top: "50%",
                            left: "50%",
                            transform: "translate(-50%, -50%)",
                          }}
                        />
                      </motion.div>

                      <div
                        className="absolute text-center"
                        style={{
                          ...getNodeLabelStyle(node, size),
                          fontFamily: "'Patrick Hand', cursive",
                          color: COLORS.text,
                          fontSize: "32px",
                        }}
                      >
                        {node.label}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>

          {(graphQuery.isLoading || visibleNodes.length === 0) && (
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center hand-drawn-card p-8"
                style={{ backgroundColor: COLORS.paper }}
              >
                <PressureText as="div" variant="strong" className="text-3xl mb-2 paper-text" style={{ fontFamily: "'Caveat', cursive" }}>
                  Building Identity Graph...
                </PressureText>
                <div style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec }}>
                  Correlating platforms, identities, and broker exposures.
                </div>
              </motion.div>
            </div>
          )}

          {graphQuery.isError && (
            <div className="absolute inset-x-8 top-6 hand-drawn-card p-4" style={{ backgroundColor: "rgba(185, 74, 72, 0.08)" }}>
              <p style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.red }}>
                Failed to load identity graph.
              </p>
              <button type="button" className="hand-drawn-button mt-2 px-3 py-1" onClick={() => graphQuery.refetch()}>
                Retry
              </button>
            </div>
          )}
        </div>

        <AnimatePresence>
          {selectedNode && (
            <motion.div
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 20, opacity: 0 }}
              className="w-80 p-5 relative hand-drawn-card"
              style={{
                backgroundColor: COLORS.card,
                borderLeft: "1.5px dashed rgba(0,0,0,0.15)",
                borderRadius: "0",
              }}
              data-reaper-expression="thinking"
              data-reaper-phrases="Deep dive into this specific node.||What secrets are hiding here?||I can feel the data rot in this entry.||The anatomy of their digital greed."
            >
              <button
                type="button"
                onClick={() => setSelectedNodeId(null)}
                className="absolute top-4 right-4 p-1.5 transition-colors"
                style={{ color: COLORS.textSec, border: "1px solid rgba(0,0,0,0.2)", borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px" }}
              >
                <X className="w-4 h-4" />
              </button>

              <div className="mb-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-4 h-4 rounded-full border-2" style={{ borderColor: getNodeColor(selectedNode.type), backgroundColor: COLORS.paper }}>
                    <div className="w-2 h-2 rounded-full m-auto mt-[3px]" style={{ backgroundColor: getNodeColor(selectedNode.type), opacity: 0.7 }} />
                  </div>
                  <PressureText as="h3" className="text-2xl" style={{ fontFamily: "'Caveat', cursive" }}>
                    {selectedNode.label}
                  </PressureText>
                </div>

                <div
                  className="text-sm uppercase tracking-wider mb-3 px-2 py-1 inline-block"
                  style={{
                    fontFamily: "'Patrick Hand', cursive",
                    border: `1.5px solid ${getNodeColor(selectedNode.type)}`,
                    borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
                    color: getNodeColor(selectedNode.type),
                  }}
                  data-reaper-expression="thinking"
                  data-reaper-phrases={`Deep dive into ${selectedNode.label}. Let's see their secrets.||Target analysis in biological detail.||Data extraction in progress.`}
                >
                  {selectedNode.type}
                </div>
              </div>

              {selectedNode.data && (
                <div className="space-y-4">
                  {selectedNode.data.platform && <DetailRow label="Platform" value={selectedNode.data.platform} />}
                  {selectedNode.data.value && <DetailRow label="Value" value={selectedNode.data.value} />}
                  {selectedNode.data.status && <DetailRow label="Status" value={selectedNode.data.status} />}

                  {selectedNode.data.details && selectedNode.data.details.length > 0 && (
                    <div>
                      <div className="text-sm mb-2" style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec }}>
                        Details
                      </div>
                      <div className="space-y-1">
                        {selectedNode.data.details.map((detail) => (
                          <div key={detail} style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.text }}>
                            • {detail}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-5 pt-4" style={{ borderTop: "1.5px dashed rgba(0,0,0,0.12)" }}>
                <div className="text-sm mb-1" style={{ fontFamily: "'Patrick Hand', cursive", color: COLORS.textSec }}>
                  Connections
                </div>
                <div className="text-2xl" style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, color: COLORS.text }}>
                  {selectedNode.connections.length} linked node{selectedNode.connections.length !== 1 ? "s" : ""}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
