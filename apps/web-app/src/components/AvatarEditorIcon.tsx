import {
  Eye,
  Glasses,
  Palette,
  Pipette,
  Scissors,
  Shirt,
  Smile,
  VenetianMask,
} from "lucide-react";
import type { AvatarEditorControlId } from "../derivedProfile";

interface AvatarEditorIconProps {
  controlId: AvatarEditorControlId;
}

export function AvatarEditorIcon({
  controlId,
}: AvatarEditorIconProps): React.ReactElement {
  switch (controlId) {
    case "top":
      return <Scissors size={30} strokeWidth={2.1} />;
    case "hairColor":
      return <Palette size={30} strokeWidth={2.1} />;
    case "accessories":
      return <Glasses size={30} strokeWidth={2.1} />;
    case "face":
      return <Eye size={30} strokeWidth={2.1} />;
    case "mouth":
      return <Smile size={30} strokeWidth={2.1} />;
    case "facialHair":
      return <VenetianMask size={30} strokeWidth={2.1} />;
    case "skin":
      return <Pipette size={30} strokeWidth={2.1} />;
    case "clothing":
      return <Shirt size={30} strokeWidth={2.1} />;
  }
}
