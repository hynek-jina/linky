import type { SystemRoutesProps } from "../../routes/AppRouteContent";
import { useSystemRouteProps } from "../../routes/useSystemRouteProps";

interface UseSystemSettingsCompositionParams {
  systemRouteBuilderInput: Parameters<typeof useSystemRouteProps>[0];
}

export interface SystemSettingsCompositionResult {
  systemRouteProps: SystemRoutesProps;
}

export const useSystemSettingsComposition = ({
  systemRouteBuilderInput,
}: UseSystemSettingsCompositionParams): SystemSettingsCompositionResult => {
  return {
    systemRouteProps: useSystemRouteProps(systemRouteBuilderInput),
  };
};
