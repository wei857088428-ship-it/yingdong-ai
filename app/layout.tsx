import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.aiyingdong.com"),
  title: { default: "影动 AI · 对话、图片与视频创作平台", template: "%s · 影动 AI" },
  description: "集 AI 对话、图片生成和视频生成于一体的中文创作平台。用一句话完成策划、写作、角色设计与动态镜头创作。",
  openGraph: { title: "影动 AI · 把想法变成作品", description: "对话、图片与视频，统一在一个 AI 创作空间。", url: "https://www.aiyingdong.com", siteName: "影动 AI", locale: "zh_CN", type: "website" },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
