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

  it("links images instead of loading them", () => {
    const { container } = render(
      <DeckMarkdown>
        {
          "![Cover art](https://example.com/cover.png) ![](https://example.com/b.png) ![local](cover.png)"
        }
      </DeckMarkdown>,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("link", { name: "Cover art" })).toHaveAttribute(
      "href",
      "https://example.com/cover.png",
    );
    expect(
      screen.getByRole("link", { name: "https://example.com/b.png" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("local")).not.toBeInTheDocument();
  });
});
