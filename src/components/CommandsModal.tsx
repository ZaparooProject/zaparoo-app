import { useTranslation } from "react-i18next";
import { SlideModal } from "@/components/SlideModal.tsx";
import { Button } from "@/components/wui/Button.tsx";

export function CommandsModal(props: {
  isOpen: boolean;
  close: () => void;
  onSelect: (command: string) => void;
}) {
  const { t } = useTranslation();

  const commands = [
    { label: "launch.system", command: "**launch.system:" },
    { label: "launch.random", command: "**launch.random:" },
    { label: "launch.search", command: "**launch.search:" },
    { label: "input.keyboard", command: "**input.keyboard:" },
    { label: "input.gamepad", command: "**input.gamepad:" },
    { label: "input.coinp1", command: "**input.coinp1:1" },
    { label: "input.coinp2", command: "**input.coinp2:1" },
    { label: "playlist.load", command: "**playlist.load:" },
    { label: "playlist.play", command: "**playlist.play:" },
    { label: "playlist.stop", command: "**playlist.stop" },
    { label: "playlist.next", command: "**playlist.next" },
    { label: "playlist.previous", command: "**playlist.previous" },
    { label: "playlist.pause", command: "**playlist.pause" },
    { label: "playlist.goto", command: "**playlist.goto:" },
    { label: "playlist.open", command: "**playlist.open:" },
    { label: "mister.ini", command: "**mister.ini:" },
    { label: "mister.core", command: "**mister.core:" },
    { label: "mister.script", command: "**mister.script:" },
    { label: "http.get", command: "**http.get:" },
    { label: "http.post", command: "**http.post:" },
    { label: "stop", command: "**stop" },
    { label: "execute", command: "**execute:" },
    { label: "delay", command: "**delay:" },
  ];

  const categories = {
    Launch: ["launch.system", "launch.random", "launch.search"],
    Input: ["input.keyboard", "input.gamepad", "input.coinp1", "input.coinp2"],
    Playlist: [
      "playlist.load",
      "playlist.play",
      "playlist.stop",
      "playlist.next",
      "playlist.previous",
      "playlist.pause",
      "playlist.goto",
      "playlist.open",
    ],
    MiSTer: ["mister.ini", "mister.core", "mister.script"],
    HTTP: ["http.get", "http.post"],
    Other: ["stop", "execute", "delay"],
  };

  return (
    <SlideModal
      isOpen={props.isOpen}
      close={props.close}
      title={t("create.custom.commands")}
    >
      <div className="flex flex-col gap-4">
        {Object.entries(categories).map(([category, commandLabels]) => (
          <div key={category} className="flex flex-col gap-2">
            <h3 className="text-lg font-semibold capitalize">{category}</h3>
            <div className="flex flex-col gap-2">
              {commands
                .filter((cmd) => commandLabels.includes(cmd.label))
                .map((cmd) => (
                  <Button
                    key={cmd.label}
                    label={cmd.label}
                    variant="outline"
                    intent="primary"
                    onClick={() => {
                      props.onSelect(cmd.command);
                      props.close();
                    }}
                    className="touch-manipulation"
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
    </SlideModal>
  );
}
