import type { PeopleRoutesProps } from "../../routes/AppRouteContent";
import { buildPeopleRouteProps } from "../../routes/props/buildPeopleRouteProps";

interface UseProfilePeopleCompositionParams {
  peopleRouteBuilderInput: Parameters<typeof buildPeopleRouteProps>[0];
}

export interface ProfilePeopleCompositionResult {
  peopleRouteProps: PeopleRoutesProps;
}

export const useProfilePeopleComposition = ({
  peopleRouteBuilderInput,
}: UseProfilePeopleCompositionParams): ProfilePeopleCompositionResult => {
  return {
    peopleRouteProps: buildPeopleRouteProps(peopleRouteBuilderInput),
  };
};
