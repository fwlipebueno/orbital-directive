import type { StationState } from "@orbital/shared";

export type SceneId =
  | "entry"
  | "dashboard"
  | "modules"
  | "research"
  | "incidents"
  | "logs"
  | "debrief"
  | "settings";

export interface SceneCredit {
  label: string;
  sourceUrl: string;
  author: string;
  license: string;
}

export interface SpaceSceneDefinition {
  id: SceneId;
  title: string;
  subtitle: string;
  imageUrl: string;
  focal: string;
  overlay: string;
  credit: SceneCredit;
}

const scenes: Record<SceneId, SpaceSceneDefinition> = {
  entry: {
    id: "entry",
    title: "Orbital Access",
    subtitle: "Authorization corridor",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/9/97/The_Earth_seen_from_Apollo_17.jpg",
    focal: "center 38%",
    overlay:
      "linear-gradient(180deg, rgba(3,8,16,0.24), rgba(2,7,14,0.8)), radial-gradient(circle at 50% 80%, rgba(122,208,255,0.34), transparent 56%), radial-gradient(circle at 82% 20%, rgba(255,240,210,0.12), transparent 32%)",
    credit: {
      label: "The Earth seen from Apollo 17",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:The_Earth_seen_from_Apollo_17.jpg",
      author: "NASA / Apollo 17 crew",
      license: "Public domain (NASA)"
    }
  },
  dashboard: {
    id: "dashboard",
    title: "Orbital Theater",
    subtitle: "Primary mission viewport",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/7/77/ISS066-E-94036_-_View_of_Earth.jpg",
    focal: "center 42%",
    overlay:
      "linear-gradient(180deg, rgba(2,7,14,0.14), rgba(2,7,14,0.78)), radial-gradient(circle at 54% 74%, rgba(129,196,255,0.42), transparent 54%), radial-gradient(circle at 20% 10%, rgba(255,240,214,0.16), transparent 42%)",
    credit: {
      label: "ISS066-E-94036 · View of Earth",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:ISS066-E-94036_-_View_of_Earth.jpg",
      author: "NASA / JSC Earth Science and Remote Sensing Unit",
      license: "Public domain (NASA)"
    }
  },
  modules: {
    id: "modules",
    title: "Engineering Orbit",
    subtitle: "Living subsystem topology",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/3/30/Earthrise_-_Apollo_8_%289460163430%29.jpg",
    focal: "center 58%",
    overlay:
      "linear-gradient(180deg, rgba(3,7,16,0.28), rgba(2,6,13,0.82)), radial-gradient(circle at 70% 24%, rgba(124,176,255,0.24), transparent 42%), radial-gradient(circle at 18% 72%, rgba(112,212,196,0.16), transparent 38%)",
    credit: {
      label: "Earthrise · Apollo 8",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Earthrise_-_Apollo_8_(9460163430).jpg",
      author: "NASA / Bill Anders",
      license: "Public domain (NASA)"
    }
  },
  research: {
    id: "research",
    title: "Research Lattice",
    subtitle: "Orbital discovery chamber",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/9/97/NGC_7293.jpg",
    focal: "center 48%",
    overlay:
      "linear-gradient(180deg, rgba(5,8,18,0.24), rgba(4,8,16,0.8)), radial-gradient(circle at 52% 34%, rgba(255,186,117,0.26), transparent 52%), radial-gradient(circle at 24% 18%, rgba(120,194,255,0.18), transparent 36%)",
    credit: {
      label: "NGC 7293 (Helix Nebula)",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:NGC_7293.jpg",
      author: "NASA / ESA / C.R. O'Dell",
      license: "Mission release"
    }
  },
  incidents: {
    id: "incidents",
    title: "Containment Board",
    subtitle: "Tactical incident response",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/c/ce/ISS056-E-96100_-_View_of_Earth.jpg",
    focal: "center 54%",
    overlay:
      "linear-gradient(180deg, rgba(8,10,15,0.22), rgba(7,8,13,0.84)), radial-gradient(circle at 62% 22%, rgba(242,185,93,0.28), transparent 48%), radial-gradient(circle at 24% 76%, rgba(255,122,122,0.16), transparent 34%)",
    credit: {
      label: "ISS056-E-96100 · View of Earth",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:ISS056-E-96100_-_View_of_Earth.jpg",
      author: "NASA / JSC Earth Science and Remote Sensing Unit",
      license: "Public domain (NASA)"
    }
  },
  logs: {
    id: "logs",
    title: "Mission Archive",
    subtitle: "Operational memory lane",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/3/30/Earthrise_-_Apollo_8_%289460163430%29.jpg",
    focal: "center 46%",
    overlay:
      "linear-gradient(180deg, rgba(3,8,16,0.22), rgba(3,7,14,0.84)), radial-gradient(circle at 26% 70%, rgba(120,194,255,0.24), transparent 46%)",
    credit: {
      label: "Earthrise · Apollo 8",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Earthrise_-_Apollo_8_(9460163430).jpg",
      author: "NASA / Bill Anders",
      license: "Public domain (NASA)"
    }
  },
  debrief: {
    id: "debrief",
    title: "Cycle Debrief",
    subtitle: "Trajectory review",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/9/97/The_Earth_seen_from_Apollo_17.jpg",
    focal: "center 28%",
    overlay:
      "linear-gradient(180deg, rgba(3,8,16,0.22), rgba(3,7,14,0.84)), radial-gradient(circle at 72% 20%, rgba(110,191,255,0.24), transparent 44%)",
    credit: {
      label: "The Earth seen from Apollo 17",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:The_Earth_seen_from_Apollo_17.jpg",
      author: "NASA / Apollo 17 crew",
      license: "Public domain (NASA)"
    }
  },
  settings: {
    id: "settings",
    title: "Mission Settings",
    subtitle: "Comfort and command profile",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/9/97/NGC_7293.jpg",
    focal: "center 54%",
    overlay:
      "linear-gradient(180deg, rgba(4,8,16,0.3), rgba(3,7,14,0.84)), radial-gradient(circle at 50% 28%, rgba(255,174,117,0.17), transparent 52%), radial-gradient(circle at 78% 74%, rgba(122,208,255,0.12), transparent 32%)",
    credit: {
      label: "NGC 7293 (Helix Nebula)",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:NGC_7293.jpg",
      author: "NASA / ESA / C.R. O'Dell",
      license: "Mission release"
    }
  }
};

export function resolveSceneId(pathname: string): SceneId {
  if (pathname === "/login" || pathname === "/demo") {
    return "entry";
  }
  if (pathname.startsWith("/modules")) {
    return "modules";
  }
  if (pathname.startsWith("/research")) {
    return "research";
  }
  if (pathname.startsWith("/incidents")) {
    return "incidents";
  }
  if (pathname.startsWith("/logs")) {
    return "logs";
  }
  if (pathname.startsWith("/run-summary")) {
    return "debrief";
  }
  if (pathname.startsWith("/settings")) {
    return "settings";
  }
  return "dashboard";
}

export function getSceneDefinition(id: SceneId): SpaceSceneDefinition {
  return scenes[id];
}

export function listSceneCredits(): SceneCredit[] {
  const unique = new Map<string, SceneCredit>();
  for (const scene of Object.values(scenes)) {
    if (!unique.has(scene.credit.sourceUrl)) {
      unique.set(scene.credit.sourceUrl, scene.credit);
    }
  }
  return [...unique.values()];
}

export function getSeverityOverlay(severity: StationState["runSummary"]["severity"]): string {
  switch (severity) {
    case "crisis":
      return "radial-gradient(circle at 76% 18%, rgba(255,115,115,0.22), transparent 38%)";
    case "alert":
      return "radial-gradient(circle at 72% 22%, rgba(242,185,93,0.2), transparent 38%)";
    case "attention":
      return "radial-gradient(circle at 74% 20%, rgba(122,208,255,0.18), transparent 38%)";
    default:
      return "radial-gradient(circle at 74% 20%, rgba(68,201,179,0.16), transparent 38%)";
  }
}
