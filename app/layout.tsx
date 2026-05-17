import "./globals.css";

export const metadata = {
  title: "Unicron Systems",
  description:
    "Adaptive intelligence for companies that need to spot what matters before others do.",
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
};

// Single Google Fonts request covering the v8 landing typography:
//   Instrument Serif (modal hero + brand wordmark)
//   JetBrains Mono   (labels, button text, feed, body monospace)
//   Syne             (hero headline)
//   Outfit           (hero subhead)
//   Playfair Display italic (eyebrow)
const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@300;400&family=Syne:wght@400;500;600;700&family=Outfit:wght@300;400;500;600&family=Playfair+Display:ital,wght@1,400;1,500;1,600&display=swap";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONTS_HREF} />
      </head>
      <body>{children}</body>
    </html>
  );
}
