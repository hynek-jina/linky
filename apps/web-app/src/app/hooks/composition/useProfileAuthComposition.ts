import type { useEvolu } from "../../../evolu";
import type { Lang } from "../../../i18n";
import type { IdentityChangeMessageSource } from "../../lib/identityChangeMessage";
import { useProfileAuthDomain } from "../useProfileAuthDomain";

interface UseProfileAuthCompositionParams {
  appendIdentityChangeNoticesRef: React.MutableRefObject<
    | ((args: {
        changedAtSec: number;
        identitySource: IdentityChangeMessageSource;
      }) => void)
    | null
  >;
  currentNsec: string | null;
  lang: Lang;
  pushToast: (message: string) => void;
  t: (key: string) => string;
  upsert: ReturnType<typeof useEvolu>["upsert"];
}

export type ProfileAuthCompositionResult = ReturnType<
  typeof useProfileAuthDomain
>;

export const useProfileAuthComposition = ({
  appendIdentityChangeNoticesRef,
  currentNsec,
  lang,
  pushToast,
  t,
  upsert,
}: UseProfileAuthCompositionParams): ProfileAuthCompositionResult => {
  return useProfileAuthDomain({
    appendIdentityChangeNoticesRef,
    currentNsec,
    lang,
    pushToast,
    t,
    upsert,
  });
};
