import { useProfileAuthDomain } from "../useProfileAuthDomain";

interface UseProfileAuthCompositionParams {
  currentNsec: string | null;
  pushToast: (message: string) => void;
  t: (key: string) => string;
}

export type ProfileAuthCompositionResult = ReturnType<
  typeof useProfileAuthDomain
>;

export const useProfileAuthComposition = ({
  currentNsec,
  pushToast,
  t,
}: UseProfileAuthCompositionParams): ProfileAuthCompositionResult => {
  return useProfileAuthDomain({
    currentNsec,
    pushToast,
    t,
  });
};
