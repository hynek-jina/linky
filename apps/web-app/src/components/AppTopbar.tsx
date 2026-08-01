import React from "react";
import {
  useAppShellActions,
  useAppShellCore,
} from "../app/context/AppShellContexts";
import {
  getDesktopRouteSection,
  isDesktopSectionEntryRoute,
} from "../app/routes/desktopRouteSection";
import { useNavigation } from "../hooks/useRouting";
import { Topbar } from "./Topbar";

interface AppTopbarProps {
  className?: string;
  desktopDetail?: boolean;
}

export function AppTopbar({
  className = "",
  desktopDetail = false,
}: AppTopbarProps): React.ReactElement {
  const actions = useAppShellActions();
  const state = useAppShellCore();
  const navigateTo = useNavigation();
  const desktopTopbar = isDesktopSectionEntryRoute(state.route)
    ? {
        icon: "×",
        label: state.t("close"),
        onClick: () =>
          navigateTo({ route: getDesktopRouteSection(state.route) }),
      }
    : state.route.kind === "cashuTokenEmit"
      ? {
          icon: "<",
          label: state.t("back"),
          onClick: () => navigateTo({ route: "cashuTokens" }),
        }
      : state.topbar;
  const desktopTopbarRight =
    state.topbarRight?.icon === "☰" ? null : state.topbarRight;

  return (
    <div className={className}>
      <Topbar
        chatTopbarContact={state.chatTopbarContact}
        currentNpub={state.currentNpub}
        effectiveProfileName={state.effectiveProfileName}
        effectiveProfilePicture={state.effectiveProfilePicture}
        nostrPictureByNpub={state.nostrPictureByNpub}
        openProfileQr={actions.openProfileQr}
        route={state.route}
        t={state.t}
        topbar={desktopDetail ? desktopTopbar : state.topbar}
        topbarRight={desktopDetail ? desktopTopbarRight : state.topbarRight}
        topbarTitle={state.topbarTitle}
      />
    </div>
  );
}
