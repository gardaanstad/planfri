import {
  Building2,
  Cable,
  Bike,
  BusFront,
  Car,
  CloudRain,
  Drama,
  Factory,
  Flame,
  GlassWater,
  Home,
  Hospital,
  Landmark,
  Plane,
  Route,
  School,
  Ship,
  Store,
  TrainFront,
  TrainFrontTunnel,
  TramFront,
  Trees,
  UtilityPole,
  Waves,
  Wind,
  type LucideProps,
} from "lucide-react";
import { mainCategoryOf, type Category } from "../lib/data";

/**
 * Each category's icon. Optional: a category without one takes its main
 * category's, so a new one needs no icon to show.
 */
const icons: Partial<Record<Category, React.ComponentType<LucideProps>>> = {
  Samferdsel: Route,
  Vei: Car,
  Jernbane: TrainFront,
  "T-bane": TrainFrontTunnel,
  Sporvei: TramFront,
  Kollektiv: BusFront,
  "Sykkel og gange": Bike,
  Havn: Ship,
  Luftfart: Plane,
  Annet: Cable,
  Kraftproduksjon: Wind,
  Strømnett: UtilityPole,
  Fjernvarme: Flame,
  "CO₂-lagring": Factory,
  Drikkevann: GlassWater,
  Avløp: Waves,
  Overvann: CloudRain,
  Helse: Hospital,
  Skole: School,
  "Kultur og idrett": Drama,
  Forvaltning: Landmark,
  Byutvikling: Building2,
  Bolig: Home,
  Næring: Store,
  "Byrom og park": Trees,
};

export default function CategoryIcon({
  category,
  ...props
}: LucideProps & { category: Category }) {
  const Icon = icons[category] ?? icons[mainCategoryOf(category)] ?? Building2;
  return <Icon aria-hidden="true" {...props} />;
}

