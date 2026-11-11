import { GrowthLayers } from '@/components/GrowthLayers';
import { Nav } from '@/components/Nav';
import { Hero } from '@/components/Hero';
import { Prologue } from '@/components/sections/Prologue';
import { Projects } from '@/components/sections/Projects';
import { Stack } from '@/components/sections/Stack';
import { FieldNotes } from '@/components/sections/FieldNotes';
import { Contact } from '@/components/sections/Contact';
import { Footer } from '@/components/Footer';

export default function Home() {
  return (
    <>
      <GrowthLayers />
      <Nav />
      <main id="top">
        <Hero />
        <Prologue />
        <Projects />
        <Stack />
        <FieldNotes />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
