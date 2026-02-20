import { useProfileAuthDomain } from "../useProfileAuthDomain";

interface UseProfileAuthCompositionParams {
  currentNsec: string | null;
  pushToast: (message: string) => void;
  t: (key: string) => string;
  update: ReturnType<typeof import("../../../evolu").useEvolu>["update"];
  upsert: ReturnType<typeof import("../../../evolu").useEvolu>["upsert"];
}

export type ProfileAuthCompositionResult = ReturnType<
  typeof useProfileAuthDomain
>;

export const useProfileAuthComposition = ({
  currentNsec,
  pushToast,
  t,
  update,
  upsert,
}: UseProfileAuthCompositionParams): ProfileAuthCompositionResult => {
  return useProfileAuthDomain({
    currentNsec,
    pushToast,
    t,
    update,
    upsert,
  });
};
