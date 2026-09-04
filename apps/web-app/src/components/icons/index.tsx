import {
  ArrowDownToLine,
  BadgePlus,
  CircleEllipsis,
  CirclePlus,
  Compass,
  Copy as LucideCopy,
  EllipsisVertical,
  HandCoins,
  HeartHandshake,
  Images,
  Keyboard as LucideKeyboard,
  MessageCircle,
  MessageCircleMore,
  Pencil,
  Radio,
  Reply,
  Send as LucideSend,
  Share2,
  SquarePlus,
  SwitchCamera,
  UserPlus,
  Users,
  Wallet as LucideWallet,
  type LucideProps,
} from "lucide-react";

interface IconProps extends LucideProps {
  size?: number | string;
}

export function ContactsIcon({ size = 24, ...props }: IconProps) {
  return <Users size={size} {...props} />;
}

export function WalletIcon({ size = 24, ...props }: IconProps) {
  return <LucideWallet size={size} {...props} />;
}

export function ContactAddIcon({ size = 24, ...props }: IconProps) {
  return <UserPlus size={size} {...props} />;
}

export function TokenAddIcon({ size = 24, ...props }: IconProps) {
  return <CirclePlus size={size} {...props} />;
}

export function NfcIcon({ size = 24, ...props }: IconProps) {
  return <Radio size={size} {...props} />;
}

export function BrowserMenuIcon({ size = 24, ...props }: IconProps) {
  return <EllipsisVertical size={size} {...props} />;
}

export function ShareIcon({ size = 24, ...props }: IconProps) {
  return <Share2 size={size} {...props} />;
}

export function SafariIcon({ size = 24, ...props }: IconProps) {
  return <Compass size={size} {...props} />;
}

export function AddToHomeIcon({ size = 24, ...props }: IconProps) {
  return <SquarePlus size={size} {...props} />;
}

export function MessagesIcon({ size = 24, ...props }: IconProps) {
  return <MessageCircleMore size={size} {...props} />;
}

export function FeedbackIcon({ size = 24, ...props }: IconProps) {
  return <MessageCircle size={size} {...props} />;
}

export function PayIcon({ size = 24, ...props }: IconProps) {
  return <HandCoins size={size} {...props} />;
}

export function DonateIcon({ size = 24, ...props }: IconProps) {
  return <HeartHandshake size={size} {...props} />;
}

export function RequestIcon({ size = 24, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12 3v11.8c0 1.7-.7 3.3-1.9 4.5L7 22.4 2.6 18l4.2-4.2L9.9 3.7A1.1 1.1 0 0 1 12 4Z" />
      <path d="M12 3v11.8c0 1.7.7 3.3 1.9 4.5l3.1 3.1 4.4-4.4-4.2-4.2-3.1-10.1A1.1 1.1 0 0 0 12 4Z" />
      <path d="m4.8 15.8 4.4 4.4M19.2 15.8l-4.4 4.4" />
    </svg>
  );
}

export function ReplyIcon({ size = 24, ...props }: IconProps) {
  return <Reply size={size} {...props} />;
}

export function EditIcon({ size = 24, ...props }: IconProps) {
  return <Pencil size={size} {...props} />;
}

export function CopyIcon({ size = 24, ...props }: IconProps) {
  return <LucideCopy size={size} {...props} />;
}

export function KeyboardIcon({ size = 24, ...props }: IconProps) {
  return <LucideKeyboard size={size} {...props} />;
}

export function PasteIcon({ size = 24, ...props }: IconProps) {
  return <LucideCopy size={size} {...props} />;
}

export function TopupIcon({ size = 24, ...props }: IconProps) {
  return <ArrowDownToLine size={size} {...props} />;
}

export function GalleryIcon({ size = 24, ...props }: IconProps) {
  return <Images size={size} {...props} />;
}

export function SwitchCameraIcon({ size = 22, ...props }: IconProps) {
  return <SwitchCamera size={size} {...props} />;
}

export function IssueTokenIcon({ size = 24, ...props }: IconProps) {
  return <BadgePlus size={size} {...props} />;
}

export function SendIcon({ size = 24, ...props }: IconProps) {
  return <LucideSend size={size} {...props} />;
}

export function NoAmountIcon({ size = 24, ...props }: IconProps) {
  return <CircleEllipsis size={size} {...props} />;
}

export function CompactCopyIcon({ size = 16, ...props }: IconProps) {
  return <LucideCopy size={size} {...props} />;
}
