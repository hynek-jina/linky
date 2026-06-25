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
  ReceiptText,
  Reply,
  Send as LucideSend,
  Share2,
  SquarePlus,
  UserPlus,
  Users,
  Wallet as LucideWallet,
  type LucideProps,
} from "lucide-react";

export interface IconProps extends LucideProps {
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

export function MessageIcon({ size = 24, ...props }: IconProps) {
  return <MessageCircle size={size} {...props} />;
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
  return <ReceiptText size={size} {...props} />;
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
