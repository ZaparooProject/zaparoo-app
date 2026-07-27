import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { MappingEditor } from "@/routes/-pages/MappingEditor";

export const Route = createFileRoute("/create/mappings_/edit_/$id")({
  component: EditMapping,
});

export function EditMapping() {
  const { id } = Route.useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const parsed = parseInt(id, 10);
  const valid = Number.isFinite(parsed) && parsed > 0;

  useEffect(() => {
    if (!valid) {
      toast.error(t("create.mappings.editor.notFound"));
      navigate({ to: "/create/mappings", replace: true });
    }
  }, [valid, navigate, t]);

  if (!valid) return null;
  return <MappingEditor id={parsed} />;
}
