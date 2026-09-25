import Markdown from "react-markdown";

// The deck name is the page's h1, so description headings start one level
// below it.
export function DeckMarkdown({ children }: { children: string }) {
  return (
    <div className="text-muted-foreground [&_a]:text-primary space-y-2 text-sm break-words [&_a]:underline [&_blockquote]:border-l [&_blockquote]:border-white/25 [&_blockquote]:pl-3 [&_h2]:font-semibold [&_h3]:font-semibold [&_h4]:font-semibold [&_h5]:font-semibold [&_h6]:font-semibold [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc">
      <Markdown
        skipHtml
        components={{
          h1: ({ children }) => <h2 className="text-lg">{children}</h2>,
          h2: ({ children }) => <h3>{children}</h3>,
          h3: ({ children }) => <h4>{children}</h4>,
          h4: ({ children }) => <h5>{children}</h5>,
          h5: ({ children }) => <h6>{children}</h6>,
          a: ({ href, children }) =>
            href ? (
              <a
                href={href}
                target={href.startsWith("#") ? undefined : "_blank"}
                rel={href.startsWith("#") ? undefined : "noopener noreferrer"}
              >
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          img: ({ src, alt }) => (
            <img
              src={src}
              alt={alt ?? ""}
              loading="lazy"
              className="max-w-full"
            />
          ),
        }}
      >
        {children}
      </Markdown>
    </div>
  );
}
