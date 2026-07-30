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
  contactsPullProgress: number;
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
  contactsPullProgress,
  groupNamesCount,
  isMainSwipeRoute,
  mainSwipeRouteBuilderInput,
  statusFilterCount,
  ungroupedCount,
}: UseRoutingViewCompositionParams): RoutingViewCompositionResult => {
  const contactsToolbarProgress =
    mainSwipeRouteBuilderInput.route.kind === "contacts"
      ? contactsHeaderVisible
        ? 1
        : contactsPullProgress
      : 0;

  const showContactsToolbar = contactsToolbarProgress > 0;
  const showGroupFilter =
    showContactsToolbar &&
    (groupNamesCount + statusFilterCount > 0 || ungroupedCount > 0);

  const contactsToolbarStyle = React.useMemo(
    () =>
      ({
        opacity: contactsToolbarProgress,
        maxHeight: `${Math.round(220 * contactsToolbarProgress)}px`,
        transform: `translateY(${(1 - contactsToolbarProgress) * -12}px)`,
        pointerEvents: contactsToolbarProgress > 0.02 ? "auto" : "none",
      }) satisfies React.CSSProperties,
    [contactsToolbarProgress],
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
