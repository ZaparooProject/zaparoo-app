import { render, screen } from "../../../test-utils";
import { describe, it, expect } from "vitest";
import { TagList } from "@/components/TagList";
import { TagInfo } from "@/lib/models";

describe("TagList", () => {
  it("should return null when tags array is empty", () => {
    render(<TagList tags={[]} />);
    // Component returns null, so no tag badges should be present
    // TagBadge uses aria-label with format "type tag"
    expect(
      screen.queryByLabelText(/region|lang|genre|player/),
    ).not.toBeInTheDocument();
  });

  it("should render a single tag correctly", () => {
    const tags: TagInfo[] = [{ type: "region", tag: "usa" }];

    render(<TagList tags={tags} />);

    // TagBadge uses aria-label with format "type tag"
    expect(screen.getByLabelText("region usa")).toBeInTheDocument();
  });

  it("should sort tags with region/lang first", () => {
    const tags: TagInfo[] = [
      { type: "genre", tag: "action" },
      { type: "region", tag: "usa" },
      { type: "player", tag: "1p" },
      { type: "lang", tag: "en" },
    ];

    render(<TagList tags={tags} maxDesktop={4} />);

    // Get all tag badges by their aria-labels
    const tagElements = screen.getAllByLabelText(/^(region|lang|genre|player)/);

    // region and lang should be first (in their original relative order)
    expect(tagElements[0]).toHaveAccessibleName("region usa");
    expect(tagElements[1]).toHaveAccessibleName("lang en");
    // Then other tags
    expect(tagElements[2]).toHaveAccessibleName("genre action");
    expect(tagElements[3]).toHaveAccessibleName("player 1p");
  });

  it("should limit visible tags based on maxDesktop", () => {
    const tags: TagInfo[] = [
      { type: "genre", tag: "action" },
      { type: "genre", tag: "rpg" },
      { type: "genre", tag: "adventure" },
      { type: "genre", tag: "puzzle" },
      { type: "genre", tag: "sports" },
    ];

    render(<TagList tags={tags} maxDesktop={3} />);

    // Should only render maxDesktop (3) tag badges
    const tagElements = screen.getAllByLabelText(/^genre/);
    expect(tagElements).toHaveLength(3);
  });

  it("should show overflow indicator with correct count on mobile", () => {
    const tags: TagInfo[] = [
      { type: "genre", tag: "action" },
      { type: "genre", tag: "rpg" },
      { type: "genre", tag: "adventure" },
      { type: "genre", tag: "puzzle" },
    ];

    render(<TagList tags={tags} maxMobile={2} maxDesktop={4} />);

    // Should show +2 indicator for mobile (4 total - 2 maxMobile)
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("should show overflow indicator with correct count on desktop", () => {
    const tags: TagInfo[] = [
      { type: "genre", tag: "action" },
      { type: "genre", tag: "rpg" },
      { type: "genre", tag: "adventure" },
      { type: "genre", tag: "puzzle" },
      { type: "genre", tag: "sports" },
      { type: "genre", tag: "racing" },
    ];

    render(<TagList tags={tags} maxMobile={2} maxDesktop={4} />);

    // Should show +2 indicator for desktop (6 total - 4 maxDesktop)
    expect(screen.getByText("+2")).toBeInTheDocument();
    // Should also show mobile overflow
    expect(screen.getByText("+4")).toBeInTheDocument();
  });

  it("should not show overflow indicator when tags fit within limits", () => {
    const tags: TagInfo[] = [
      { type: "genre", tag: "action" },
      { type: "genre", tag: "rpg" },
    ];

    render(<TagList tags={tags} maxMobile={2} maxDesktop={4} />);

    // No overflow indicators needed
    expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
  });

  it("should use default maxMobile=2 and maxDesktop=4 values", () => {
    const tags: TagInfo[] = [
      { type: "genre", tag: "action" },
      { type: "genre", tag: "rpg" },
      { type: "genre", tag: "adventure" },
      { type: "genre", tag: "puzzle" },
      { type: "genre", tag: "sports" },
    ];

    render(<TagList tags={tags} />);

    // With defaults: maxMobile=2, maxDesktop=4
    // Should render 4 tags (maxDesktop)
    const tagElements = screen.getAllByLabelText(/^genre/);
    expect(tagElements).toHaveLength(4);

    // Should show +3 for mobile (5 total - 2 maxMobile)
    expect(screen.getByText("+3")).toBeInTheDocument();
    // Should show +1 for desktop (5 total - 4 maxDesktop)
    expect(screen.getByText("+1")).toBeInTheDocument();
  });
});
