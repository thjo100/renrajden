// Inbjudan: samma typsnitt som huvudsidan, egen utskriftsanpassad stil och en utskriftsknapp.
import "@fontsource/big-shoulders-display/latin-700";
import "@fontsource/big-shoulders-display/latin-900";
import "@fontsource/familjen-grotesk/latin-400";
import "@fontsource/familjen-grotesk/latin-700";
import "@fontsource/jetbrains-mono/latin-600";
import "./inbjudan.css";

document.getElementById("print-btn").addEventListener("click", () => window.print());
