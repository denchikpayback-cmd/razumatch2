import type { Metadata, Viewport } from "next";
import "./globals.css";
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', interactiveWidget: 'resizes-content', themeColor: '#f5f7f4' };
export const metadata: Metadata = { title: 'разуMATCH', description: 'Знакомства для студентов МГУТУ имени Разумовского', icons: { icon: [{ url: '/favicon.svg?v=2', type: 'image/svg+xml' }, { url: '/favicon.ico?v=2', sizes: 'any' }], apple: '/brand/icon-192.png' } };
export default function RootLayout({ children, }: Readonly<{
    children: React.ReactNode;
}>) {
    return (<html lang="ru">
      <body className="antialiased">{children}</body>
    </html>);
}
