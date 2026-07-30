import React from "react";
import type { MainSwipeRoutesProps } from "../../routes/AppRouteContent";
import { buildMainSwipeRouteProps } from "../../routes/props/buildMainSwipeRouteProps";
import { useRouteDerivedShellState } from "../useRouteDerivedShellState";
import { useMemoizedRouteBuilder } from "./useMemoizedRouteBundle";

type MainSwipeRouteBuilderInput = Omit<
  Parameters<typeof buildMainSwipeRouteProps>[0],
  | "bottomTabActive"
  | "contactsToolbarStyle"
  | "showGroupFilter"
  | "showNoGroupFilter"
>;

interface UseRoutingViewCompositionParams {
  contactsHeaderVisible: boolean;
  contactsPulling: boolean;
  groupNamesCount: number;
  isMainSwipeRoute: boolean;
  mainSwipeRouteBuilderInput: MainSwipeRouteBuilderInput;
  statusFilterCount: number;
  ungroupedCount: number;
}

export interface RoutingViewCompositionResult {
  mainSwipeRouteProps: MainSwipeRoutesProps;
  pageClassNameWithSwipe: string;
  selectedEvoluServerUrl: string | null;
}

export const useRoutingViewComposition = ({
  contactsHeaderVisible,
  contactsPulling,
  groupNamesCount,
  isMainSwipeRoute,
  mainSwipeRouteBuilderInput,
  statusFilterCount,
  ungroupedCount,
}: UseRoutingViewCompositionParams): RoutingViewCompositionResult => {
  const showContactsToolbar =
    mainSwipeRouteBuilderInput.route.kind === "contacts" &&
    (contactsHeaderVisible || contactsPulling);
  const showGroupFilter =
    showContactsToolbar &&
    (groupNamesCount + statusFilterCount > 0 || ungroupedCount > 0);

  // Frame-rate reveal progress comes from the `--contacts-pull` CSS variable
  // written by the pull-gesture handlers, so this style object stays stable
  // during the gesture instead of invalidating the route bundle per frame.
  const contactsToolbarStyle = React.useMemo(
    () =>
      ({
        opacity: "var(--contacts-pull, 0)",
        maxHeight: "calc(var(--contacts-pull, 0) * 220px)",
        transform: "translateY(calc((1 - var(--contacts-pull, 0)) * -12px))",
        pointerEvents: showContactsToolbar ? "auto" : "none",
      }) satisfies React.CSSProperties,
    [showContactsToolbar],
  );

  const { bottomTabActive, pageClassNameWithSwipe, selectedEvoluServerUrl } =
    useRouteDerivedShellState({
      isMainSwipeRoute,
      route: mainSwipeRouteBuilderInput.route,
      showGroupFilter,
    });

  const routeBuilderInput = {
    ...mainSwipeRouteBuilderInput,
    bottomTabActive,
    contactsToolbarStyle,
    showGroupFilter,
  };

  return {
    mainSwipeRouteProps: useMemoizedRouteBuilder(
      routeBuilderInput,
      buildMainSwipeRouteProps,
    ),
    pageClassNameWithSwipe,
    selectedEvoluServerUrl,
  };
};
