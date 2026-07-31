import type { MainSwipeRoutesProps } from "../../routes/AppRouteContent";
import { buildMainSwipeRouteProps } from "../../routes/props/buildMainSwipeRouteProps";
import { useRouteDerivedShellState } from "../useRouteDerivedShellState";
import { useMemoizedRouteBuilder } from "./useMemoizedRouteBundle";

type MainSwipeRouteBuilderInput = Omit<
  Parameters<typeof buildMainSwipeRouteProps>[0],
  "bottomTabActive" | "showGroupFilter" | "showNoGroupFilter"
>;

interface UseRoutingViewCompositionParams {
  groupNamesCount: number;
  isMainSwipeRoute: boolean;
  mainSwipeRouteBuilderInput: MainSwipeRouteBuilderInput;
  statusFilterCount: number;
  ungroupedCount: number;
}

export interface RoutingViewCompositionResult {
  mainSwipeRouteProps: MainSwipeRoutesProps;
  pageClassNameWithSwipe: string;
}

export const useRoutingViewComposition = ({
  groupNamesCount,
  isMainSwipeRoute,
  mainSwipeRouteBuilderInput,
  statusFilterCount,
  ungroupedCount,
}: UseRoutingViewCompositionParams): RoutingViewCompositionResult => {
  const showGroupFilter =
    mainSwipeRouteBuilderInput.route.kind === "contacts" &&
    (groupNamesCount + statusFilterCount > 0 || ungroupedCount > 0);

  const { bottomTabActive, pageClassNameWithSwipe } = useRouteDerivedShellState(
    {
      isMainSwipeRoute,
      route: mainSwipeRouteBuilderInput.route,
      showGroupFilter,
    },
  );

  const routeBuilderInput = {
    ...mainSwipeRouteBuilderInput,
    bottomTabActive,
    showGroupFilter,
  };

  return {
    mainSwipeRouteProps: useMemoizedRouteBuilder(
      routeBuilderInput,
      buildMainSwipeRouteProps,
    ),
    pageClassNameWithSwipe,
  };
};
