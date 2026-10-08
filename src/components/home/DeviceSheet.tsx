import { DeviceConnectionPanel } from "@/components/home/DeviceConnectionPanel";

export function DeviceSheet(props: { isOpen: boolean; close: () => void }) {
  return <DeviceConnectionPanel {...props} />;
}
