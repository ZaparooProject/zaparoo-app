import { describe, expect, it } from "vitest";
import { render, screen } from "@/test-utils";
import { DeckMarkdown } from "@/components/library/DeckMarkdown";

describe("DeckMarkdown", () => {
  it("renders lists, emphasis and links while discarding raw HTML", () => {
    render(
      <DeckMarkdown>
        {
          "## Picks\n\n- **One**\n- [Two](https://example.com)\n- [unsafe](javascript:alert('x'))\n\n<script>alert('x')</script>"
        }
      </DeckMarkdown>,
    );
    expect(screen.getByRole("heading", { name: "Picks" })).toBeInTheDocument();
    expect(screen.getByText("One").tagName).toBe("STRONG");
    expect(screen.getByRole("link", { name: "Two" })).toHaveAttribute(
      "href",
      "https://example.com",
    );
    expect(
      screen.queryByRole("link", { name: "unsafe" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("unsafe")).toBeInTheDocument();
    expect(screen.queryByText("alert('x')")).not.toBeInTheDocument();
  });

  it("keeps description headings below the page heading", () => {
    render(<DeckMarkdown>{"# Top\n\n## Section"}</DeckMarkdown>);
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Top", level: 2 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Section", level: 3 }),
    ).toBeInTheDocument();
  });
});
