export function isTestingSurfaceEnabled() {
  return process.env.ENABLE_TESTING_SURFACE === "true";
}

export const TESTING_SURFACE_DISABLED_ERROR =
  "Testing surface is disabled. Set ENABLE_TESTING_SURFACE=true to expose this local testing UI/API.";
