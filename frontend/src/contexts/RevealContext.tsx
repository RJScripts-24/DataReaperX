import { createContext, useContext } from 'react';

export interface RevealState {
  done: boolean;
  almostDone: boolean;
}

export const RevealContext = createContext<RevealState>({ done: true, almostDone: true });

export const useReveal = () => useContext(RevealContext).done;
export const useRevealState = () => useContext(RevealContext);
