// Standardinnehåll för årets lopp, resultatarkivet och partnerna.
//
// Används när Firestore saknar innehållet (innan en administratör har sparat något första gången)
// eller inte går att nå när sajten byggs. När en administratör sparar första gången kopieras
// det här innehållet till Firestore, och därefter är det Firestore som gäller.
// Ändra alltså i adminläget på sajten, inte här.

export const DEFAULT_EVENT = {
  date: "2027-01-30",
  startTime: "10:00",
  status: "planned",
  venue: "Ormbergsstadion",
  venueArea: "Ormberget, Luleå",
  mapUrl: "https://www.google.com/maps/search/?api=1&query=Ormbergsstadion%2C%20Lule%C3%A5",
  deadline: "2027-01-24",
  registrationUrl: "",
  startListUrl: "",
  liveResultsUrl: "",
  email: "info@renrajden.se",
  lapKm: 10.5,
  climbPerLap: 98,
  waterPerLap: 2,
  coldLimit: -20,
  distances: [
    { km: 42, laps: 4, classes: "HD42", fee: 500, lateFee: 600, note: "Prisutdelning för 1:a–3:e i HD42, direkt när de gått i mål." },
    { km: 21, laps: 2, classes: "HD21", fee: 300, lateFee: 350, note: "Pris till vinnarna i HD21." },
    { km: 10.5, laps: 1, classes: "Motion", fee: 200, lateFee: 200, note: "Motionsdistans på 10,5 km. Start kl 10:00, samtidigt som de långa." },
  ],
};

const link = (label, url) => ({ label, url });
const year = (y, fields) => ({ year: y, status: "held", date: "", text: "", winners: [], links: [], invitation: null, ...fields });

export const DEFAULT_YEARS = [
  year(2026, { status: "cancelled", text: "Paus." }),
  year(2025, {
    date: "2025-02-09",
    winners: [{ class: "H42", names: "Viktor Mäenpää" }, { class: "D42", names: "Helena Lundkvist" }, { class: "H21", names: "Samuel Matkala Nordlund" }, { class: "D21", names: "Elvira Niva" }],
    links: [
      link("Resultat (pdf)", "https://drive.google.com/file/d/18MDWvPwT7fYfBq7Ffobwkv2o5Ng6c-tY/view?usp=sharing"),
      link("Liveresultat", "http://live.skidor.com/5583#result@46786@1@-1"),
      link("Startlista", "https://drive.google.com/file/d/11-cwtSXdqn99fxNKolL9g5z0oK6Qnghb/view?usp=sharing"),
    ],
    invitation: link("Inbjudan 2025", "https://drive.google.com/file/d/1zls7gy47sPfDOObksWetWNeUa4RoDA6Z/view?usp=sharing"),
  }),
  year(2024, {
    date: "2024-02-10",
    winners: [{ class: "H42", names: "Viktor Mäenpää" }, { class: "D42", names: "Siri Jeppson" }, { class: "D21", names: "Ebba Rönnbäck" }],
    links: [
      link("Resultat (pdf)", "https://drive.google.com/file/d/1Auuj2y_SYhVtES366o7NH1-czVkCQ14x/view?usp=sharing"),
      link("SSF TA", "https://ta.skidor.com/ResultList.aspx?eventid=14793&competitionid=25311&orgid=2920"),
    ],
    invitation: link("Inbjudan 2024", "https://drive.google.com/file/d/1QMQdZtp4bTciwujqiT23ZmbOjenoj-QN/view?usp=sharing"),
  }),
  year(2023, {
    date: "2023-02-11",
    winners: [{ class: "H42", names: "Simon Öberg" }, { class: "D42", names: "Åse Borgeryd" }, { class: "H21", names: "Martin Lundholm" }, { class: "D21", names: "Mathea Eriksson" }],
    links: [link("Resultat", "https://drive.google.com/file/d/1MLrjuAHvQ4BOJSSZ6t7kAgGW8lONGRv2/view?usp=share_link")],
    invitation: link("Inbjudan 2023", "https://drive.google.com/file/d/1UDaIENyTIf-ig6vSlUeimXJ261k_S6MK/view?usp=share_link"),
  }),
  year(2022, {
    date: "2022-02-19",
    winners: [{ class: "H42", names: "Henrik Strand" }, { class: "D42", names: "Nina Lintzén" }, { class: "H21", names: "Viktor Sundén" }, { class: "D21", names: "Anna Rimpi" }],
    links: [
      link("Resultat", "https://drive.google.com/file/d/1IGspsGsRtOmkcbsIR68j7WqscqUged3u/view?usp=sharing"),
      link("Varvtider (chip)", "http://obasen.orientering.se/winsplits/online/sv/default.asp?page=table&databaseId=80132&categoryId=0"),
      link("Bilder", "https://photos.app.goo.gl/VTYn9jouczi5rCTv9"),
    ],
    invitation: link("Inbjudan 2022", "https://www.okrenen.se/globalassets/ok-renen---orientering/tavling/inbjudan-renrajden-2022.pdf"),
  }),
  year(2021, { status: "cancelled", text: "Inställt. Tävlingen var planerad till 2 januari 2021." }),
  year(2020, {
    date: "2020-01-25",
    winners: [{ class: "H42", names: "Magnus Näslund" }, { class: "D42", names: "Ellen Scheidegger" }, { class: "H21", names: "Andreas Karlsson" }, { class: "D21", names: "Annaclara Forss" }],
    links: [
      link("Resultat (pdf)", "https://www.okrenen.se/globalassets/ok-renen---orientering/dokument/resultat-renrajden2020.pdf"),
      link("SSF TA", "http://ta.skidor.com/ResultList.aspx?eventid=11471&competitionid=19335&orgid=2920"),
      link("skidresultat.se", "https://skidresultat.se/?cat=comp&id=4553"),
    ],
    invitation: link("Inbjudan 2020", "http://www.okrenen.se/globalassets/ok-renen---orientering/dokument/inbjudan-renrajden-2020.pdf"),
  }),
  year(2019, { status: "cancelled", text: "Paus. Klubben arrangerade flera stora event." }),
  year(2018, {
    date: "2018-01-28",
    winners: [{ class: "H42", names: "Hannes Boström" }, { class: "D42", names: "Nina Lintzén" }, { class: "H21", names: "Niklas Henriksson" }, { class: "D21", names: "Vilma Kilpala" }],
    text: "Även Kalvrajden för HD10–16.",
    links: [
      link("SSF TA", "http://ta.skidor.com/ResultList.aspx?eventid=8698&competitionid=14578&orgid=2920"),
      link("Resultat (pdf)", "https://drive.google.com/open?id=1BeeHlL6ls90ua54wohkR_BRZpj585R7-"),
      link("skidresultat.se", "http://skidresultat.se/?cat=comp&id=3873&a1=res"),
      link("Bilder", "https://www.flickr.com/photos/139458541@N05/sets/72157691084581201"),
    ],
    invitation: link("Renrajden och Kalvrajden 2018", "http://ta.skidor.com/EventFiles/ae91fdbe-bcbd-4b51-b76f-5f04395fe2c6.pdf"),
  }),
  year(2017, {
    date: "2017-01-14",
    winners: [{ class: "H42", names: "Klas Nilsson" }, { class: "D42", names: "Anna Rimpi" }, { class: "H21", names: "Oskar Sundqvist" }, { class: "D21", names: "Boel Sandström" }],
    links: [
      link("SSF TA", "http://ta.skidor.com/ResultList.aspx?eventid=7506&competitionid=12701&orgid=2920"),
      link("Resultat (pdf)", "https://drive.google.com/open?id=0B1D0YYjNfoooRUxHeHkxN19YYm8"),
      link("skidresultat.se", "http://skidresultat.se/?cat=comp&id=3597&a1=res"),
      link("Kuriren", "http://www.kuriren.nu/nyheter/tungt-fore-gav-rejal-genomkorare-i-arets-renrajden-9091356.aspx"),
      link("NSD", "http://www.nsd.se/sport/vinnaren-missnojd-med-tiden-katastrof-10395936.aspx"),
    ],
    invitation: link("Inbjudan 2017", "http://ta.skidor.com/EventFiles/5652af6c-138d-4ce6-a0dc-858d59e502f2.pdf"),
  }),
  year(2016, {
    date: "2016-01-16",
    winners: [{ class: "H42", names: "Niklas Henriksson" }, { class: "D42", names: "Nina Lintzén" }, { class: "H21", names: "Lars Mattsson" }, { class: "D21", names: "Karin Rönnbäck" }],
    links: [
      link("Resultat (pdf)", "http://www.okrenen.se/globalassets/ok-renen---orientering/tavling/renrajden2016_resultat.pdf"),
      link("Kalvrajden", "http://skidresultat.se/?cat=comp&id=3224&a1=res&a2=-1"),
      link("Bilder och film", "https://goo.gl/photos/7WFKvNaPG35Dzgkq5"),
      link("Kuriren", "http://www.kuriren.nu/sport/landslagskille-slog-rekord-pa-ormberget-8685214.aspx"),
      link("Damvinnaren berättar", "https://ninalintzen.wordpress.com/2016/01/16/antligen-tavling-renrajden/"),
    ],
  }),
  year(2015, {
    date: "2015-01-17",
    winners: [
      { class: "H42", names: "Tarjei Solli" },
      { class: "D42", names: "Emma Bergström" },
      { class: "H21", names: "Karl Edenroth" },
      { class: "D21", names: "Catrin Ingvarsson" },
    ],
    links: [
      link("Resultat", "https://docs.google.com/spreadsheets/d/1f9HGkHk8o17EsdgJ_ZBJSgh3F4vJIVprvc4jA9HVslM/pubhtml"),
      link("Varvtider", "http://fij.se/ttt/rr15.html"),
      link("skidresultat.se", "http://skidresultat.se/?cat=comp&id=2663&a1=res"),
      link("Kuriren", "http://www.kuriren.nu/sport/spannande-spurtduell-avgjorde-renrajden-8079740.aspx"),
      link("NSD", "http://www.nsd.se/sport/mental-seger-i-renrajden-9015448.aspx"),
    ],
  }),
  year(2014, { status: "cancelled", text: "Inställt på grund av kyla." }),
  year(2013, {
    date: "2013-01-19",
    winners: [{ class: "H42", names: "Daniel Nordebo" }, { class: "D42", names: "Malin Rensfeldt" }, { class: "H21", names: "Samuel Jonsson" }, { class: "D21", names: "Annika Berggren" }],
    links: [link("Resultat", "https://drive.google.com/file/d/0B1D0YYjNfooockxvbFIwU3hoTlk/view")],
  }),
];

// Partnerna visas i den här ordningen. url är tom eller https://. former är namnen under Tidigare år, ett per rad.
export const DEFAULT_PARTNERS = {
  partners: [
    { name: "Umara", text: "Sportdryck i spåret", url: "" },
    { name: "Port of Luleå", text: "Klubbpartner", url: "" },
    { name: "Hermelinen", text: "Priser", url: "" },
    { name: "Sweco", text: "Priser", url: "" },
    { name: "Lappland Media", text: "Priser", url: "" },
    { name: "ICA Kvantum", text: "Priser", url: "" },
    { name: "ICA Porsön", text: "Priser", url: "" },
  ],
  former: ["Vauhti", "Pakkala Sport", "Äventyrsbutiken Hägglunds", "Team Sportia", "Agio", "Lulebo", "SCA", "Nordchark", "Kuriren", "Vitargo"].join("\n"),
};
