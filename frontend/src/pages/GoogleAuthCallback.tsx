import { useEffect } from "react";

export default function GoogleAuthCallback() {
  useEffect(() => {
    const query = window.location.search || "";
    window.location.replace(`/access-mirror${query}`);
  }, []);

  return null;
}

