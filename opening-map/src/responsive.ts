export const mobileLiveBoardBreakpoint = 680;

export function shouldStartLiveBoardMinimized(viewportWidth: number) {
  return viewportWidth <= mobileLiveBoardBreakpoint;
}
