import { Navbar } from "../components/Navbar";
import { HeroSection } from "../components/HeroSection";
import { ProblemSection } from "../components/ProblemSection";
import { FeaturesSection } from "../components/FeaturesSection";
import { PrivacyEngineSection } from "../components/PrivacyEngineSection";
import { ProcessFlowSection } from "../components/ProcessFlowSection";
import { FinalCTASection } from "../components/FinalCTASection";
import { Footer } from "../components/Footer";
import { PressureFilter } from "../components/PressureFilter";
import { LandingRevealMask } from "../components/LandingRevealMask";

export default function Landing() {
  return (
    <div className="min-h-screen">
      <LandingRevealMask>
        <PressureFilter />
        <Navbar />
        <HeroSection />
        <ProblemSection />
        <FeaturesSection />
        <PrivacyEngineSection />
        <ProcessFlowSection />
        <FinalCTASection />
        <Footer />
      </LandingRevealMask>
    </div>
  );
}
