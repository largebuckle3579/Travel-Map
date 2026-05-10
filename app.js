const mapWidth = 1000;
const mapHeight = 520;
const mapTop = 10;
const mapBottom = 500;
const palette = ["#f7df82", "#a9d79a", "#b9cbe4", "#f2b789", "#a4d6d1", "#d8c3e8", "#c9e4a5", "#f4c6c0"];
const majorLabelNames = new Set([
  "Algeria",
  "Angola",
  "Argentina",
  "Australia",
  "Brazil",
  "Canada",
  "China",
  "Colombia",
  "Democratic Republic of the Congo",
  "Egypt",
  "Ethiopia",
  "France",
  "Germany",
  "Greenland",
  "India",
  "Indonesia",
  "Iran",
  "Kazakhstan",
  "Libya",
  "Mali",
  "Mexico",
  "Mongolia",
  "Nigeria",
  "Peru",
  "Russia",
  "Saudi Arabia",
  "South Africa",
  "Sudan",
  "Turkey",
  "United States of America"
]);

const labelOverrides = {
  Canada: [-105, 58],
  "United States of America": [-99, 39],
  Mexico: [-102, 23],
  Brazil: [-53, -11],
  Argentina: [-65, -38],
  Russia: [88, 61],
  China: [103, 35],
  India: [78, 22],
  Australia: [134, -25],
  Greenland: [-42, 72],
  Indonesia: [118, -3],
  "South Africa": [24, -29]
};

const displayNames = {
  "United States of America": "United States",
  "Democratic Republic of the Congo": "DR Congo"
};

const countryLayer = document.querySelector("#countryLayer");
const lightbox = document.querySelector("#lightbox");
const lightboxCountry = document.querySelector("#lightboxCountry");
const lightboxTitle = document.querySelector("#lightboxTitle");
const gallery = document.querySelector("#gallery");
const uploadForm = document.querySelector("#uploadForm");
const photoTitle = document.querySelector("#photoTitle");
const photoFile = document.querySelector("#photoFile");
const uploadStatus = document.querySelector("#uploadStatus");
const mapFullscreenButton = document.querySelector("#mapFullscreenButton");
const slideshow = document.querySelector("#slideshow");
const slideImage = document.querySelector("#slideImage");
const slideCountry = document.querySelector("#slideCountry");
const slideTitle = document.querySelector("#slideTitle");
const slideCounter = document.querySelector("#slideCounter");
const prevSlide = document.querySelector("#prevSlide");
const nextSlide = document.querySelector("#nextSlide");
const closeSlideshowButton = document.querySelector("#closeSlideshow");

let countries = [];
let currentCountry = null;
let currentPhotos = [];
let slideIndex = 0;
let slideTimer = null;

const supabaseConfig = window.SUPABASE_CONFIG || {};
const hasSupabaseConfig = Boolean(supabaseConfig.url && supabaseConfig.anonKey && window.supabase);
const supabaseClient = hasSupabaseConfig ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey) : null;

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function createSvgElement(tag, attrs) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function project([longitude, latitude]) {
  const x = ((longitude + 180) / 360) * mapWidth;
  const y = mapTop + ((90 - latitude) / 180) * (mapBottom - mapTop);
  return [x, y];
}

function getPolygons(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

function ringArea(points) {
  let total = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    total += points[index][0] * points[index + 1][1] - points[index + 1][0] * points[index][1];
  }
  return Math.abs(total / 2);
}

function projectedRing(ring) {
  const points = [];
  let previous = null;

  ring.forEach((coord) => {
    const point = project(coord);
    if (!previous || Math.hypot(point[0] - previous[0], point[1] - previous[1]) > 0.35) {
      points.push(point);
      previous = point;
    }
  });

  return points;
}

function featureToPath(feature) {
  return getPolygons(feature.geometry)
    .map((polygon) =>
      polygon
        .map((ring) => {
          const points = projectedRing(ring);
          if (points.length < 3) return "";
          return `M${points.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join("L")}Z`;
        })
        .join("")
    )
    .join("");
}

function featureStats(feature) {
  const rings = getPolygons(feature.geometry)
    .flatMap((polygon) => polygon.map(projectedRing))
    .filter((ring) => ring.length > 2);
  const largestRing = rings.reduce((largest, ring) => (ringArea(ring) > ringArea(largest) ? ring : largest), rings[0] || []);
  const xs = largestRing.map(([x]) => x);
  const ys = largestRing.map(([, y]) => y);
  const area = largestRing.length ? ringArea(largestRing) : 0;
  const center = largestRing.length
    ? [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
    : [0, 0];

  return { area, center };
}

function labelFor(country) {
  if (country.displayName === "United States") return "UNITED STATES";
  if (country.displayName === "DR Congo") return "DR CONGO";
  if (country.name === "Central African Republic") return "C.A.R.";
  if (country.displayName.length > 14) {
    return country.displayName
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase();
  }
  return country.displayName.toUpperCase();
}

function shouldShowLabel(country) {
  return country.area > 115 || majorLabelNames.has(country.name);
}

function fontSizeFor(country) {
  if (country.area > 11000) return 14;
  if (country.area > 4500) return 11;
  if (country.area > 1600) return 8.5;
  if (country.area > 500) return 6.5;
  return 4.8;
}

function countryFromFeature(feature, index) {
  const name = feature.properties.name;
  const displayName = displayNames[name] || name;
  const id = slugify(name);
  const override = labelOverrides[name] ? project(labelOverrides[name]) : null;
  const stats = featureStats(feature);
  const savedPhotos = (window.COUNTRY_PHOTOS?.[id] || []).filter((photo) => photo.src);

  return {
    id,
    name,
    displayName,
    area: stats.area,
    center: override || stats.center,
    color: palette[index % palette.length],
    path: featureToPath(feature),
    note: `Add photos from ${displayName}, then click the country to see them here.`,
    hasPhotos: savedPhotos.length > 0,
    localPhotos: savedPhotos,
    photos: savedPhotos
  };
}

function setUploadStatus(message, tone = "") {
  uploadStatus.textContent = message;
  uploadStatus.dataset.tone = tone;
}

function safeFileName(fileName) {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function updateCountryUnlockStates() {
  countries.forEach((country) => {
    document.querySelectorAll(`.country-group[data-country="${country.id}"]`).forEach((group) => {
      group.classList.toggle("is-locked", !country.hasPhotos);
    });
  });
}

async function loadUnlockedCountries() {
  if (!supabaseClient) {
    updateCountryUnlockStates();
    return;
  }

  const { data, error } = await supabaseClient.from("country_photos").select("country_id");
  if (error) {
    console.warn("Could not load unlocked countries", error);
    updateCountryUnlockStates();
    return;
  }

  const unlocked = new Set(data.map((photo) => photo.country_id));
  countries.forEach((country) => {
    country.hasPhotos = country.hasPhotos || unlocked.has(country.id);
  });
  updateCountryUnlockStates();
}

function renderMap() {
  const features = window.COUNTRY_GEOJSON.features
    .filter((feature) => feature.properties.name !== "Antarctica")
    .sort((a, b) => featureStats(b).area - featureStats(a).area);

  countries = features.map(countryFromFeature);

  countries.forEach((country) => {
    const group = createSvgElement("g", {
      tabindex: "0",
      role: "button",
      class: `country-group${country.hasPhotos ? "" : " is-locked"}`,
      "data-country": country.id,
      "aria-label": `Open ${country.displayName} photos`
    });
    const path = createSvgElement("path", {
      d: country.path,
      class: "country-hit",
      "data-country": country.id,
      fill: country.color
    });

    group.append(path);

    if (shouldShowLabel(country)) {
      const labelHit = createSvgElement("circle", {
        cx: country.center[0],
        cy: country.center[1],
        r: fontSizeFor(country) * 3.2,
        class: "country-label-hit",
        "data-country": country.id,
        "aria-hidden": "true"
      });
      const label = createSvgElement("text", {
        x: country.center[0],
        y: country.center[1],
        class: "country-label",
        "font-size": fontSizeFor(country),
        "aria-hidden": "true"
      });
      label.textContent = labelFor(country);
      group.append(labelHit, label);
    }

    group.addEventListener("click", () => openCountry(country.id));
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openCountry(country.id);
      }
    });
    countryLayer.append(group);
  });
}

function photoMarkup(photo, index, countryName) {
  if (photo.src) {
    return `<img src="${photo.src}" alt="${photo.title || `${countryName} photo ${index + 1}`}">`;
  }

  return `<div class="photo-fallback">${photo.title || `Add photo ${index + 1}`}</div>`;
}

function selectCountry(country) {
  document.querySelectorAll(".country-hit").forEach((path) => {
    path.classList.toggle("is-selected", path.dataset.country === country.id);
  });
}

async function openCountry(countryId) {
  const country = countries.find((item) => item.id === countryId);
  if (!country) return;
  selectCountry(country);
  const photos = await loadOnlinePhotos(country);
  country.photos = photos;
  country.hasPhotos = photos.length > 0;
  updateCountryUnlockStates();

  if (photos.length) {
    startSlideshow(country, photos);
  } else {
    showPhotoManager(country, photos);
  }
}

function renderGallery(country, photos) {
  gallery.innerHTML = photos.length
    ? photos.map((photo, index) => `<article class="photo-card">${photoMarkup(photo, index, country.displayName)}</article>`).join("")
    : `<article class="empty-gallery">No photos yet. Upload the first one.</article>`;
}

async function loadOnlinePhotos(country) {
  if (!supabaseClient) return country.photos;

  const { data, error } = await supabaseClient
    .from("country_photos")
    .select("title,image_url,created_at")
    .eq("country_id", country.id)
    .order("created_at", { ascending: false });

  if (error) {
    setUploadStatus(`Could not load online photos: ${error.message}`, "error");
    return country.photos;
  }

  const onlinePhotos = data.map((photo) => ({
    title: photo.title,
    src: photo.image_url
  }));

  return [...onlinePhotos, ...country.localPhotos];
}

function updateSlide() {
  const photo = currentPhotos[slideIndex];
  if (!photo) return;

  slideImage.src = photo.src;
  slideImage.alt = photo.title || `${currentCountry.displayName} photo ${slideIndex + 1}`;
  slideCountry.textContent = currentCountry.displayName;
  slideTitle.textContent = photo.title || `${currentCountry.displayName} photo`;
  slideCounter.textContent = `${slideIndex + 1} / ${currentPhotos.length}`;
}

function scheduleSlideAdvance() {
  window.clearInterval(slideTimer);
  if (currentPhotos.length > 1) {
    slideTimer = window.setInterval(() => {
      slideIndex = (slideIndex + 1) % currentPhotos.length;
      updateSlide();
    }, 4500);
  }
}

function startSlideshow(country, photos) {
  currentCountry = country;
  currentPhotos = photos;
  slideIndex = 0;
  lightbox.hidden = true;
  slideshow.hidden = false;
  updateSlide();
  scheduleSlideAdvance();
  enterFullscreen();
  closeSlideshowButton.focus();
}

async function enterAppFullscreen() {
  if (document.fullscreenElement || !document.documentElement.requestFullscreen) return;

  try {
    await document.documentElement.requestFullscreen();
  } catch (error) {
    console.warn("Fullscreen request was not allowed", error);
  }
}

async function enterFullscreen() {
  if (document.fullscreenElement || !slideshow.requestFullscreen) return;

  try {
    await slideshow.requestFullscreen();
  } catch (error) {
    console.warn("Fullscreen request was not allowed", error);
  }
}

async function exitFullscreen() {
  if (!document.fullscreenElement || !document.exitFullscreen) return;

  try {
    await document.exitFullscreen();
  } catch (error) {
    console.warn("Fullscreen exit failed", error);
  }
}

async function closeSlideshow(openManager = true) {
  window.clearInterval(slideTimer);
  slideshow.hidden = true;
  await exitFullscreen();
  if (openManager && currentCountry) {
    showPhotoManager(currentCountry, currentPhotos);
  }
}

function showPhotoManager(country, photos = country.photos) {
  currentCountry = country;
  lightboxCountry.textContent = country.displayName;
  lightboxTitle.textContent = photos.length ? `${country.displayName} photos` : `Unlock ${country.displayName}`;
  photoTitle.value = "";
  photoFile.value = "";
  lightbox.hidden = false;
  renderGallery(country, photos);
  setUploadStatus(
    hasSupabaseConfig
      ? photos.length
        ? "Add more photos to this country."
        : "No photos yet. Upload one to unlock this country."
      : "Supabase is not connected yet. Add your URL and anon key in assets/supabase-config.js.",
    hasSupabaseConfig ? "" : "error"
  );
  lightbox.querySelector("[data-close]").focus();
}

function closeGallery() {
  lightbox.hidden = true;
}

document.querySelectorAll("[data-close]").forEach((button) => {
  button.addEventListener("click", closeGallery);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !slideshow.hidden) {
    closeSlideshow(true);
  } else if (event.key === "Escape" && !lightbox.hidden) {
    closeGallery();
  } else if (event.key === "ArrowRight" && !slideshow.hidden && currentPhotos.length > 1) {
    slideIndex = (slideIndex + 1) % currentPhotos.length;
    updateSlide();
    scheduleSlideAdvance();
  } else if (event.key === "ArrowLeft" && !slideshow.hidden && currentPhotos.length > 1) {
    slideIndex = (slideIndex - 1 + currentPhotos.length) % currentPhotos.length;
    updateSlide();
    scheduleSlideAdvance();
  }
});

closeSlideshowButton.addEventListener("click", () => closeSlideshow(true));

nextSlide.addEventListener("click", () => {
  if (!currentPhotos.length) return;
  slideIndex = (slideIndex + 1) % currentPhotos.length;
  updateSlide();
  scheduleSlideAdvance();
});

prevSlide.addEventListener("click", () => {
  if (!currentPhotos.length) return;
  slideIndex = (slideIndex - 1 + currentPhotos.length) % currentPhotos.length;
  updateSlide();
  scheduleSlideAdvance();
});

mapFullscreenButton.addEventListener("click", enterAppFullscreen);

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentCountry) return;
  if (!supabaseClient) {
    setUploadStatus("Connect Supabase first in assets/supabase-config.js.", "error");
    return;
  }

  const file = photoFile.files[0];
  if (!file) {
    setUploadStatus("Choose a photo first.", "error");
    return;
  }

  const title = photoTitle.value.trim() || `${currentCountry.displayName} photo`;
  const extension = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const path = `${currentCountry.id}/${crypto.randomUUID()}-${safeFileName(file.name) || `photo.${extension}`}`;

  setUploadStatus("Uploading photo...");
  uploadForm.querySelector("button").disabled = true;

  const uploadResult = await supabaseClient.storage
    .from(supabaseConfig.bucket || "country-photos")
    .upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false
    });

  if (uploadResult.error) {
    uploadForm.querySelector("button").disabled = false;
    setUploadStatus(`Upload failed: ${uploadResult.error.message}`, "error");
    return;
  }

  const { data: publicUrlData } = supabaseClient.storage
    .from(supabaseConfig.bucket || "country-photos")
    .getPublicUrl(path);

  const insertResult = await supabaseClient.from("country_photos").insert({
    country_id: currentCountry.id,
    country_name: currentCountry.displayName,
    title,
    image_path: path,
    image_url: publicUrlData.publicUrl
  });

  uploadForm.querySelector("button").disabled = false;

  if (insertResult.error) {
    setUploadStatus(`Photo uploaded, but saving the record failed: ${insertResult.error.message}`, "error");
    return;
  }

  photoTitle.value = "";
  photoFile.value = "";
  const updatedPhotos = await loadOnlinePhotos(currentCountry);
  currentCountry.photos = updatedPhotos;
  currentCountry.hasPhotos = updatedPhotos.length > 0;
  currentPhotos = updatedPhotos;
  updateCountryUnlockStates();
  setUploadStatus("Saved online. This country is unlocked.");
  renderGallery(currentCountry, updatedPhotos);
});

renderMap();
loadUnlockedCountries();
