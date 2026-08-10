import { render, screen } from "@/test-utils";
import { afterEach, describe, it, expect, vi } from "vitest";
import { TagList } from "@/components/TagList";
import { TagInfo } from "@/lib/models";

describe("TagList", () => {
  afterEach(() => vi.restoreAllMocks());

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

    expect(screen.getByText("region:usa")).toBeInTheDocument();
    expect(screen.getByText("region usa")).toBeInTheDocument();
  });

  it("should support compact display text without changing accessible labels", () => {
    const tags: TagInfo[] = [{ type: "region", tag: "world" }];

    render(<TagList tags={tags} formatTag={() => "W"} />);

    expect(screen.getByText("W")).toBeInTheDocument();
    expect(screen.getByText("region world")).toBeInTheDocument();
  });

  it("should sort tags with region/lang first", () => {
    const tags: TagInfo[] = [
      { type: "genre", tag: "action" },
      { type: "region", tag: "usa" },
      { type: "player", tag: "1p" },
      { type: "lang", tag: "en" },
    ];

    render(<TagList tags={tags} />);

    const tagElements = screen.getAllByText(
      /^(region:usa|lang:en|genre:action|player:1p)$/,
    );

    expect(tagElements.map((element) => element.textContent)).toEqual([
      "region:usa",
      "lang:en",
      "genre:action",
      "player:1p",
    ]);
  });

  it("should preserve server tag order when requested", () => {
    const tags: TagInfo[] = [
      { type: "unfinished", tag: "wip" },
      { type: "region", tag: "usa" },
    ];

    render(<TagList tags={tags} preserveOrder />);

    const tagElements = screen.getAllByText(/^(unfinished:wip|region:usa)$/);
    expect(tagElements.map((element) => element.textContent)).toEqual([
      "unfinished:wip",
      "region:usa",
    ]);
  });

  it("should show one accurate overflow count for tags that do not fit", () => {
    const clientWidth = vi
      .spyOn(HTMLElement.prototype, "clientWidth", "get")
      .mockReturnValue(130);
    const offsetWidth = vi
      .spyOn(HTMLElement.prototype, "offsetWidth", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.textContent?.startsWith("+") ? 30 : 40;
      });
    const computedStyle = vi
      .spyOn(window, "getComputedStyle")
      .mockReturnValue({ columnGap: "6px" } as CSSStyleDeclaration);
    const tags: TagInfo[] = [
      { type: "genre", tag: "action" },
      { type: "genre", tag: "rpg" },
      { type: "genre", tag: "adventure" },
      { type: "genre", tag: "puzzle" },
    ];

    render(<TagList tags={tags} preserveOrder />);

    expect(screen.getByText("genre:action")).toBeInTheDocument();
    expect(screen.getByText("genre:rpg")).toBeInTheDocument();
    expect(screen.queryByText("genre:adventure")).not.toBeInTheDocument();
    expect(screen.queryByText("genre:puzzle")).not.toBeInTheDocument();
    expect(screen.getAllByText("+2")).toHaveLength(1);
    expect(screen.queryByText("+1")).not.toBeInTheDocument();
    expect(screen.queryByText("+3")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "genre action, genre rpg, genre adventure, genre puzzle",
      ),
    ).toBeInTheDocument();

    clientWidth.mockRestore();
    offsetWidth.mockRestore();
    computedStyle.mockRestore();
  });

  it("should render every tag when the list has enough width", () => {
    const tags: TagInfo[] = [
      { type: "genre", tag: "action" },
      { type: "genre", tag: "rpg" },
      { type: "genre", tag: "adventure" },
    ];

    render(<TagList tags={tags} />);

    expect(screen.getByText("genre:action")).toBeInTheDocument();
    expect(screen.getByText("genre:rpg")).toBeInTheDocument();
    expect(screen.getByText("genre:adventure")).toBeInTheDocument();
    expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
  });

  it("should use tag labels consistently in visual and accessible output", () => {
    const tags: TagInfo[] = [
      { type: "genre", tag: "action", label: "Action game" },
    ];

    render(<TagList tags={tags} />);

    expect(screen.getByText("genre:Action game")).toBeInTheDocument();
    expect(screen.getByText("genre Action game")).toBeInTheDocument();
    expect(screen.queryByText("genre:action")).not.toBeInTheDocument();
  });
});
