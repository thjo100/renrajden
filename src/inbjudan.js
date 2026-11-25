// Inbjudan: samma typsnitt som huvudsidan, egen utskriftsanpassad stil och en utskriftsknapp.
// Datum, distanser och avgifter kommer från årets lopp (src/cms/) och uppdateras från Firestore.
import "@fontsource/big-shoulders-display/latin-700";
import "@fontsource/big-shoulders-display/latin-900";
import "@fontsource/familjen-grotesk/latin-400";
import "@fontsource/familjen-grotesk/latin-700";
import "@fontsource/jetbrains-mono/latin-600";
import "./inbjudan.css";
import { refreshContent } from "./cms/runtime.js";

document.getElementById("print-btn").addEventListener("click", () => window.print());
refreshContent();
