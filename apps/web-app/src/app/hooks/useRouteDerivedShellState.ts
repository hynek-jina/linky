import type { Route } from "../../types/route";

interface UseRouteDerivedShellStateParams {
  isMainSwipeRoute: boolean;
  route: Route;
  showGroupFilter: boolean;
}

interface UseRouteDerivedShellStateResult {
  bottomTabActive: "contacts" | "wallet" | null;
  pageClassNameWithSwipe: string;
}

export const useRouteDerivedShellState = ({
  isMainSwipeRoute,
  route,
  showGroupFilter,
}: UseRouteDerivedShellStateParams): UseRouteDerivedShellStateResult => {
  const bottomTabActive: "contacts" | "wallet" | null =
    route.kind === "wallet"
      ? "wallet"
      : route.kind === "contacts"
        ? "contacts"
        : null;

  const pageClassName = showGroupFilter
    ? "page has-group-filter"
    : route.kind === "chat"
      ? "page chat-page"
      : "page";
  const pageClassNameWithSwipe = isMainSwipeRoute
    ? `${pageClassName} main-swipe-active`
    : pageClassName;

  return {
    bottomTabActive,
    pageClassNameWithSwipe,
  };
};
