import {
  FolderIcon,
  Gamepad2Icon,
  HomeIcon,
  MusicIcon,
  PauseIcon,
  PlayIcon,
  PowerIcon,
  RefreshCwIcon,
  SaveIcon,
  SkipForwardIcon,
  SquareIcon,
  StarIcon,
  TvIcon,
  Volume2Icon,
  VolumeXIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import type { ZapButtonIcon } from "@/lib/zapLayout";

/** The icons a custom Zap button can carry, by their stored name. */
export const ZAP_BUTTON_ICON_COMPONENTS: Record<
  Exclude<ZapButtonIcon, "">,
  LucideIcon
> = {
  play: PlayIcon,
  pause: PauseIcon,
  stop: SquareIcon,
  next: SkipForwardIcon,
  volume: Volume2Icon,
  mute: VolumeXIcon,
  gamepad: Gamepad2Icon,
  tv: TvIcon,
  save: SaveIcon,
  folder: FolderIcon,
  power: PowerIcon,
  refresh: RefreshCwIcon,
  home: HomeIcon,
  star: StarIcon,
  music: MusicIcon,
  zap: ZapIcon,
};
