import BackgroundDecor from "@/components/BackgroundDecor";
import Footer from "@/components/Footer";
import Header from "@/components/Header";

// The crypto tool's chrome lives here rather than in the root layout so the
// studies platform (/studies) can render its own header and footer.
export default function CryptoLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <BackgroundDecor />
      <Header />
      {children}
      <Footer />
    </>
  );
}
