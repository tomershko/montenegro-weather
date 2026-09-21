// Montenegro Trip Widget for Scriptable
// Data + itinerary: https://tomershko.github.io/montenegro-weather/widget-data.json
// Weather: Open-Meteo

const DATA_URL = "https://tomershko.github.io/montenegro-weather/widget-data.json";

function ymdToUtc(key) {
  const p = key.split("-").map(Number);
  return Date.UTC(p[0], p[1] - 1, p[2]);
}

function daysBetween(a, b) {
  return Math.round((ymdToUtc(b) - ymdToUtc(a)) / 86400000);
}

function todayKey(timeZone) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
  } catch (e) {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }
}

async function getJSON(url) {
  const req = new Request(url);
  req.timeoutInterval = 12;
  return await req.loadJSON();
}

function weatherUrl(loc, forecastDays) {
  const params = [
    ["latitude", loc.lat],
    ["longitude", loc.lon],
    ["daily", "weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,precipitation_sum,wind_gusts_10m_max"],
    ["timezone", "Europe/Podgorica"],
    ["forecast_days", forecastDays || 16],
    ["temperature_unit", "celsius"],
    ["wind_speed_unit", "kmh"],
    ["precipitation_unit", "mm"]
  ];
  return "https://api.open-meteo.com/v1/forecast?" +
    params.map(function (p) {
      return encodeURIComponent(p[0]) + "=" + encodeURIComponent(String(p[1]));
    }).join("&");
}

async function getWeather(loc, date, forecastDays) {
  if (!loc) return null;
  const json = await getJSON(weatherUrl(loc, forecastDays));
  if (!json.daily || !json.daily.time) return null;
  const i = json.daily.time.indexOf(date);
  if (i < 0) return null;
  return {
    code: json.daily.weather_code[i],
    max: json.daily.temperature_2m_max[i],
    min: json.daily.temperature_2m_min[i],
    feelsMax: json.daily.apparent_temperature_max[i],
    feelsMin: json.daily.apparent_temperature_min[i],
    rain: json.daily.precipitation_probability_max[i],
    precip: json.daily.precipitation_sum[i],
    gust: json.daily.wind_gusts_10m_max[i]
  };
}

const WMO = {
  0: ["☀️", "בהיר"],
  1: ["🌤️", "בהיר בעיקר"],
  2: ["⛅️", "מעונן חלקית"],
  3: ["☁️", "מעונן"],
  45: ["🌫️", "ערפל"], 48: ["🌫️", "ערפל"],
  51: ["🌦️", "טפטוף"], 53: ["🌦️", "טפטוף"], 55: ["🌧️", "טפטוף כבד"],
  61: ["🌦️", "גשם קל"], 63: ["🌧️", "גשם"], 65: ["🌧️", "גשם כבד"],
  71: ["🌨️", "שלג קל"], 73: ["🌨️", "שלג"], 75: ["❄️", "שלג כבד"],
  80: ["🌦️", "ממטרים"], 81: ["🌧️", "ממטרים"], 82: ["⛈️", "ממטרים חזקים"],
  95: ["⛈️", "סופת רעמים"], 96: ["⛈️", "סופה וברד"], 99: ["⛈️", "סופה וברד"]
};

function weatherLabel(code) {
  return WMO[code] || ["🌡️", "תחזית"];
}

function n(v) {
  return Number.isFinite(v) ? Math.round(v) : "–";
}

function advice(wx, day) {
  if (!wx) return "התחזית עדיין לא זמינה לתאריך הזה";
  const parts = [];
  if (wx.min <= 5) parts.push("שכבה חמה");
  else if (wx.min <= 10) parts.push("פליז");
  if (wx.max >= 23) parts.push("קצר");
  else if (wx.max <= 15) parts.push("לבוש ארוך");
  if (wx.rain >= 50 || wx.precip >= 3) parts.push("מעיל גשם");
  else if (wx.rain >= 25) parts.push("הגנה מגשם");
  if (wx.gust >= 45) parts.push("רוח חזקה");
  if (day && /רפטינג/.test(day.title)) parts.push("בגד ים");
  return parts.length ? parts.join(" · ") : "שכבות קלות";
}

function addRight(container, text, size, bold, opacity, lines) {
  const t = container.addText(text);
  t.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size);
  t.textColor = new Color("#FFFFFF", opacity == null ? 1 : opacity);
  t.lineLimit = lines || 1;
  t.minimumScaleFactor = 0.72;
  t.rightAlignText();
  return t;
}

function buildErrorWidget(message, siteUrl) {
  const w = new ListWidget();
  w.backgroundColor = new Color("#173e3b");
  w.setPadding(16, 16, 16, 16);
  addRight(w, "🇲🇪 מונטנגרו", 17, true, 1, 1);
  w.addSpacer(10);
  addRight(w, message, 14, false, 0.9, 3);
  w.url = siteUrl || "https://tomershko.github.io/montenegro-weather/";
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
  return w;
}

function mapsSearchUrl(query) {
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(query || "");
}

function addRouteRow(widget, stop, index) {
  const row = widget.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  row.url = mapsSearchUrl(stop.query || stop.label);
  row.addSpacer();
  const t = row.addText((index + 1) + ". " + stop.label + "  ↗");
  t.font = Font.semiboldSystemFont(13);
  t.textColor = new Color("#FFFFFF");
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.72;
  t.rightAlignText();
  return row;
}

async function buildRouteWidget() {
  let data;
  try {
    data = await getJSON(DATA_URL);
  } catch (e) {
    return buildErrorWidget("לא הצלחתי לטעון את מסלול הטיול. לחיצה תפתח את האתר.", "https://tomershko.github.io/montenegro-weather/");
  }

  const today = todayKey(data.timeZone || "Europe/Podgorica");
  const days = data.days || [];
  const first = data.startDate;
  const last = data.endDate;
  let phase = "during";
  if (today < first) phase = "before";
  else if (today > last) phase = "after";

  let index = days.findIndex(function (d) { return d.date === today; });
  if (index < 0) {
    index = days.findIndex(function (d) { return d.date > today; });
    if (index < 0) index = Math.max(0, days.length - 1);
  }
  const day = days[index] || null;

  const w = new ListWidget();
  const g = new LinearGradient();
  g.colors = [new Color("#173e3b"), new Color("#426b60")];
  g.locations = [0, 1];
  w.backgroundGradient = g;
  w.setPadding(14, 16, 14, 16);
  w.url = day && day.url ? day.url : data.siteUrl;
  w.refreshAfterDate = new Date(Date.now() + ((data.weather && data.weather.refreshMinutes) || 30) * 60 * 1000);

  addRight(w, "🧭 המסלול של היום", 16, true, 1, 1);
  w.addSpacer(5);

  if (!day || phase === "after") {
    addRight(w, "✅ הטיול הסתיים", 20, true, 1, 1);
    w.addSpacer(5);
    addRight(w, "כל המסלול נשאר זמין באתר", 13, false, 0.82, 2);
    return w;
  }

  if (phase === "before") {
    const left = daysBetween(today, first);
    addRight(w, "המסלול הראשון · בעוד " + left + (left === 1 ? " יום" : " ימים"), 11, false, 0.76, 1);
  } else {
    addRight(w, "יום " + (index + 1) + " מתוך " + days.length, 11, false, 0.76, 1);
  }

  w.addSpacer(3);
  addRight(w, day.title, 16, true, 1, 2);
  w.addSpacer(7);

  const stops = day.nav || [];
  const family = config.widgetFamily || "medium";
  const maxStops = family === "large" ? 6 : family === "small" ? 2 : 4;
  stops.slice(0, maxStops).forEach(function (stop, i) {
    if (i > 0) w.addSpacer(5);
    addRouteRow(w, stop, i);
  });

  if (stops.length > maxStops) {
    w.addSpacer(5);
    addRight(w, "+ עוד " + (stops.length - maxStops) + " במסלול", 10, false, 0.72, 1);
  }

  w.addSpacer();
  if (day.stay) {
    addRight(w, "🛏️ " + day.stay, 10, false, 0.72, 1);
  } else {
    addRight(w, "לחיצה על יעד פותחת Google Maps", 10, false, 0.72, 1);
  }
  return w;
}

async function buildWidget() {
  let data;
  try {
    data = await getJSON(DATA_URL);
  } catch (e) {
    return buildErrorWidget("לא הצלחתי לטעון את נתוני הטיול. לחיצה תפתח את האתר.", "https://tomershko.github.io/montenegro-weather/");
  }

  const today = todayKey(data.timeZone || "Europe/Podgorica");
  const days = data.days || [];
  const first = data.startDate;
  const last = data.endDate;
  let phase = "during";
  if (today < first) phase = "before";
  else if (today > last) phase = "after";

  let index = days.findIndex(function (d) { return d.date === today; });
  if (index < 0) {
    index = days.findIndex(function (d) { return d.date > today; });
    if (index < 0) index = Math.max(0, days.length - 1);
  }
  const day = days[index] || null;
  const loc = day ? data.locations[day.loc] : null;

  let wx = null;
  if (day && loc && phase !== "after") {
    try {
      wx = await getWeather(loc, day.date, data.weather && data.weather.forecastDays);
    } catch (e) {}
  }

  const w = new ListWidget();
  const g = new LinearGradient();
  g.colors = [new Color("#173e3b"), new Color("#426b60")];
  g.locations = [0, 1];
  w.backgroundGradient = g;
  w.setPadding(14, 16, 14, 16);
  w.url = day && day.url ? day.url : data.siteUrl;
  w.refreshAfterDate = new Date(Date.now() + ((data.weather && data.weather.refreshMinutes) || 30) * 60 * 1000);

  addRight(w, "🇲🇪 " + (data.tripName || "מונטנגרו"), 17, true, 1, 1);
  w.addSpacer(7);

  if (phase === "before") {
    const left = daysBetween(today, first);
    addRight(w, "✈️ עוד " + left + (left === 1 ? " יום לטיול" : " ימים לטיול"), 20, true, 1, 1);
    w.addSpacer(4);
    if (day) addRight(w, "יום ראשון · " + day.date.slice(8, 10) + ".9 · " + (loc ? loc.name : ""), 12, false, 0.82, 1);
  } else if (phase === "during") {
    addRight(w, "היום · יום " + (index + 1) + " מתוך " + days.length, 12, false, 0.8, 1);
    w.addSpacer(3);
    if (day) addRight(w, day.title, 17, true, 1, 2);
  } else {
    addRight(w, "✅ הטיול הסתיים", 20, true, 1, 1);
    w.addSpacer(4);
    addRight(w, "כל המסלול נשאר זמין באתר", 13, false, 0.82, 2);
  }

  if (day && phase !== "after") {
    w.addSpacer(8);
    if (wx) {
      const wi = weatherLabel(wx.code);
      addRight(w, wi[0] + " " + (loc ? loc.name : "") + " · " + n(wx.max) + "° / " + n(wx.min) + "° · 🌧️ " + n(wx.rain) + "%", 14, true, 1, 1);
      w.addSpacer(4);
      addRight(w, "🎒 " + advice(wx, day), 12, false, 0.9, 2);
    } else {
      addRight(w, "📍 " + (loc ? loc.name : day.title), 14, true, 1, 1);
      w.addSpacer(4);
      addRight(w, "🕒 התחזית לתאריך הזה עדיין לא זמינה", 12, false, 0.82, 1);
    }

    if (phase === "during" && days[index + 1]) {
      w.addSpacer();
      addRight(w, "מחר: " + days[index + 1].title, 10, false, 0.68, 1);
    } else {
      w.addSpacer();
      addRight(w, "לחיצה לפתיחת פרטי היום באתר", 10, false, 0.68, 1);
    }
  }

  return w;
}

// Backward compatible: an empty/unknown parameter keeps the original widget.
const widgetMode = String(args.widgetParameter || "").trim().toLowerCase();
const widget = widgetMode === "route" ? await buildRouteWidget() : await buildWidget();
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentMedium();
}
Script.complete();
