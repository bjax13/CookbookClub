const statusView = document.querySelector("#statusView");
const recipesView = document.querySelector("#recipesView");
const membersView = document.querySelector("#membersView");
const membersListView = document.querySelector("#membersListView");
const resultView = document.querySelector("#resultView");
const collectionsListView = document.querySelector("#collectionsListView");
const activeUserSelect = document.querySelector("#activeUserSelect");
const activeRoleBadge = document.querySelector("#activeRoleBadge");
const dashboardClub = document.querySelector("#dashboardClub");
const dashboardMeetup = document.querySelector("#dashboardMeetup");
const dashboardRecipes = document.querySelector("#dashboardRecipes");
const onboardingChecklist = document.querySelector("#onboardingChecklist");
const flashMessage = document.querySelector("#flashMessage");
const recipeDrawer = document.querySelector("#recipeDrawer");
const closeDrawerBtn = document.querySelector("#closeDrawerBtn");
const drawerTitle = document.querySelector("#drawerTitle");
const drawerMeta = document.querySelector("#drawerMeta");
const drawerDescription = document.querySelector("#drawerDescription");
const drawerIngredients = document.querySelector("#drawerIngredients");
const drawerInstructions = document.querySelector("#drawerInstructions");
const newHostUserSelect = document.querySelector("#newHostUserSelect");
const removeMemberUserSelect = document.querySelector("#removeMemberUserSelect");
const favoriteRecipeSelect = document.querySelector("#favoriteRecipeSelect");
const recipeSearchInput = document.querySelector("#recipeSearchInput");
const recipeCategoryFilterSelect = document.querySelector("#recipeCategoryFilterSelect");
const clearRecipeFiltersBtn = document.querySelector("#clearRecipeFiltersBtn");
const recipeFilterSummary = document.querySelector("#recipeFilterSummary");

const routeButtons = [...document.querySelectorAll("[data-route]")];
const routePanels = [...document.querySelectorAll(".route")];
const ACTION_HOST_ONLY = [...document.querySelectorAll(".action-host-only")];
const ACTION_MANAGER_ONLY = [...document.querySelectorAll(".action-manager-only")];

const state = {
  status: null,
  members: [],
  recipes: [],
  collections: [],
  activeUserId: localStorage.getItem("cbc.activeUserId") || "",
  activeRole: null,
  flashTimer: null,
  recipeFilters: {
    query: "",
    category: "all",
  },
};

function show(target, value) {
  target.textContent = JSON.stringify(value, null, 2);
}

function clearFlash() {
  if (state.flashTimer) {
    clearTimeout(state.flashTimer);
    state.flashTimer = null;
  }
  flashMessage.textContent = "";
  flashMessage.classList.remove("is-visible", "is-success", "is-error");
}

function setFlash(message, kind = "success", ttlMs = 2600) {
  clearFlash();
  flashMessage.textContent = message;
  flashMessage.classList.add("is-visible", kind === "error" ? "is-error" : "is-success");
  if (ttlMs > 0) {
    state.flashTimer = setTimeout(() => {
      clearFlash();
    }, ttlMs);
  }
}

function formatRole(role) {
  return role ? role.replace(/_/g, " ") : "no role";
}

function canManage(role) {
  return ["host", "admin", "co_admin"].includes(role);
}

function routeFromHash() {
  const route = String(window.location.hash || "").replace(/^#/, "");
  return routeButtons.some((button) => button.dataset.route === route) ? route : "dashboard";
}

function setActiveRoute(route, { updateHash = true } = {}) {
  const selectedRoute = routeButtons.some((button) => button.dataset.route === route)
    ? route
    : "dashboard";
  for (const button of routeButtons) {
    button.classList.toggle("is-active", button.dataset.route === selectedRoute);
  }
  for (const panel of routePanels) {
    panel.classList.toggle("is-active", panel.id === `route-${selectedRoute}`);
  }
  if (updateHash && window.location.hash !== `#${selectedRoute}`) {
    window.location.hash = selectedRoute;
  }
  clearFlash();
}

function getActiveRoute() {
  const active = routeButtons.find((button) => button.classList.contains("is-active"));
  return active?.dataset.route || "dashboard";
}

function bodyFrom(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function parseMultilineList(value) {
  if (!value) return [];
  return String(value)
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseCsvList(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function optional(value) {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : undefined;
}

async function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read selected image file."));
    reader.readAsDataURL(file);
  });
}

function currentActorUserId() {
  if (!state.activeUserId) throw new Error("Select an active user first.");
  return state.activeUserId;
}

function ensureFormNote(form) {
  let note = form.nextElementSibling;
  if (!note || !note.classList.contains("form-note")) {
    note = document.createElement("p");
    note.className = "form-note";
    form.insertAdjacentElement("afterend", note);
  }
  return note;
}

function setFormBusy(form, busy) {
  const buttons = [...form.querySelectorAll("button")];
  for (const button of buttons) {
    if (!button.dataset.label) button.dataset.label = button.textContent || "";
    button.disabled = busy;
    button.textContent = busy ? "Working..." : button.dataset.label;
  }
}

function clearFormNote(form) {
  const note = ensureFormNote(form);
  note.textContent = "";
  note.classList.remove("is-error", "is-success");
}

function setFormNote(form, message, kind) {
  const note = ensureFormNote(form);
  note.textContent = message;
  note.classList.remove("is-error", "is-success");
  if (kind === "error") note.classList.add("is-error");
  if (kind === "success") note.classList.add("is-success");
}

function assertMembership() {
  if (!state.activeRole) throw new Error("Active user must be a club member.");
}

function assertHost() {
  assertMembership();
  if (state.activeRole !== "host") throw new Error("Only host can perform this action.");
}

function assertManager() {
  assertMembership();
  if (!canManage(state.activeRole))
    throw new Error("Only host/admin/co_admin can perform this action.");
}

function applyRoleGates() {
  const isHost = state.activeRole === "host";
  const isManager = canManage(state.activeRole);
  for (const element of ACTION_HOST_ONLY) {
    element.classList.toggle("action-disabled", !isHost);
  }
  for (const element of ACTION_MANAGER_ONLY) {
    element.classList.toggle("action-disabled", !isManager);
  }
}

function setSelectOptions(select, options, { placeholderLabel }) {
  if (!select) return;
  const currentValue = select.value;
  select.textContent = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = placeholderLabel;
  select.append(placeholder);
  for (const optionData of options) {
    const option = document.createElement("option");
    option.value = optionData.value;
    option.textContent = optionData.label;
    select.append(option);
  }
  if (options.some((option) => option.value === currentValue)) {
    select.value = currentValue;
  } else if (options[0]) {
    select.value = options[0].value;
  } else {
    select.value = "";
  }
}

function timeSummary(recipe) {
  const parts = [
    recipe.prepTime ? `Prep ${formatDuration(recipe.prepTime)}` : null,
    recipe.cookTime ? `Cook ${formatDuration(recipe.cookTime)}` : null,
    recipe.totalTime ? `Total ${formatDuration(recipe.totalTime)}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" | ") : null;
}

function formatDuration(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/);
  if (!match) return raw;
  const days = Number(match[1] || 0);
  const hours = Number(match[2] || 0);
  const mins = Number(match[3] || 0);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (mins) parts.push(`${mins}m`);
  return parts.length ? parts.join(" ") : raw;
}

function renderChips(items) {
  const values = items.filter(Boolean);
  if (!values.length) return null;
  const row = document.createElement("div");
  row.className = "recipe-chips";
  for (const value of values) {
    const chip = document.createElement("span");
    chip.className = "recipe-chip";
    chip.textContent = value;
    row.append(chip);
  }
  return row;
}

function savedRecipeIds() {
  const ids = new Set();
  for (const collection of state.collections || []) {
    const recipes = Array.isArray(collection.recipes) ? collection.recipes : [];
    for (const recipe of recipes) {
      if (recipe?.id) ids.add(recipe.id);
    }
  }
  return ids;
}

async function saveRecipeToFavorites({ recipeId }) {
  assertMembership();
  const actorUserId = currentActorUserId();
  const favorite = await api("/api/favorites", {
    method: "POST",
    body: JSON.stringify({ actorUserId, recipeId }),
  });
  const collection = await api("/api/collections", {
    method: "POST",
    body: JSON.stringify({ actorUserId, recipeId, collectionName: "Favorites" }),
  });
  return { favorite, collection };
}

async function saveRecipeFromCard(recipe, button) {
  if (!recipe?.id) return;
  const originalText = button.textContent;
  button.disabled = true;
  button.classList.add("is-busy");
  button.textContent = "Saving...";
  try {
    await saveRecipeToFavorites({ recipeId: recipe.id });
    await loadCollectionsForActiveUser({ render: getActiveRoute() === "cookbook" });
    if (getActiveRoute() === "recipes") {
      renderRecipes(state.recipes);
    }
    setFlash(`Saved "${recipe.title || recipe.name || recipe.id}" to Favorites.`, "success");
    show(resultView, { ok: true, action: "favorite", recipeId: recipe.id });
  } catch (error) {
    setFlash(error.message, "error", 4200);
    show(resultView, { error: error.message });
  } finally {
    button.disabled = false;
    button.classList.remove("is-busy");
    button.textContent = originalText;
  }
}

function openRecipeDrawer(recipe) {
  if (!recipeDrawer) return;
  drawerTitle.textContent = recipe.name || recipe.title || "Untitled Recipe";
  const metaBits = [];
  if (recipe.author?.name) metaBits.push(`By ${recipe.author.name}`);
  if (recipe.recipeYield) metaBits.push(`Yield: ${recipe.recipeYield}`);
  if (recipe.recipeCategory) metaBits.push(`Category: ${recipe.recipeCategory}`);
  if (recipe.recipeCuisine) metaBits.push(`Cuisine: ${recipe.recipeCuisine}`);
  const times = timeSummary(recipe);
  if (times) metaBits.push(times);
  drawerMeta.textContent = metaBits.join(" • ");
  drawerDescription.textContent = recipe.description || "No description provided.";

  drawerIngredients.textContent = "";
  const ingredients = Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient : [];
  if (ingredients.length) {
    for (const ingredient of ingredients) {
      const li = document.createElement("li");
      li.textContent = ingredient;
      drawerIngredients.append(li);
    }
  } else {
    const li = document.createElement("li");
    li.textContent = "No ingredients listed.";
    drawerIngredients.append(li);
  }

  drawerInstructions.textContent = "";
  const instructions = Array.isArray(recipe.recipeInstructions) ? recipe.recipeInstructions : [];
  if (instructions.length) {
    for (const step of instructions) {
      const li = document.createElement("li");
      li.textContent = typeof step === "string" ? step : step.text || "";
      drawerInstructions.append(li);
    }
  } else {
    const li = document.createElement("li");
    li.textContent = "No instructions listed.";
    drawerInstructions.append(li);
  }

  recipeDrawer.showModal();
}

function renderRecipes(recipes) {
  state.recipes = Array.isArray(recipes) ? recipes : [];
  syncRecipeFilterOptions();
  renderFilteredRecipes();
}

function syncRecipeFilterOptions() {
  if (!recipeCategoryFilterSelect) return;
  const categories = [
    ...new Set(
      state.recipes.map((recipe) => String(recipe.recipeCategory || "").trim()).filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b));
  const previous = state.recipeFilters.category;
  recipeCategoryFilterSelect.textContent = "";
  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "All categories";
  recipeCategoryFilterSelect.append(allOption);
  for (const category of categories) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    recipeCategoryFilterSelect.append(option);
  }
  if (previous !== "all" && categories.includes(previous)) {
    recipeCategoryFilterSelect.value = previous;
  } else {
    recipeCategoryFilterSelect.value = "all";
    state.recipeFilters.category = "all";
  }
}

function filteredRecipes() {
  const query = state.recipeFilters.query.trim().toLowerCase();
  const category = state.recipeFilters.category;
  return state.recipes.filter((recipe) => {
    if (category !== "all" && (recipe.recipeCategory || "") !== category) return false;
    if (!query) return true;
    const haystack = [
      recipe.title,
      recipe.name,
      recipe.description,
      recipe.author?.name,
      ...(Array.isArray(recipe.keywords) ? recipe.keywords : []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

function renderFilteredRecipes() {
  const savedIds = savedRecipeIds();
  const recipes = filteredRecipes();
  recipesView.textContent = "";
  if (!recipes.length) {
    const empty = document.createElement("p");
    empty.className = "empty-recipes";
    empty.textContent = state.recipes.length
      ? "No recipes match your filters."
      : "No recipes found for this meetup.";
    recipesView.append(empty);
    if (recipeFilterSummary)
      recipeFilterSummary.textContent = `Showing 0 of ${state.recipes.length} recipes`;
    syncDynamicSelects();
    return;
  }

  for (const recipe of recipes) {
    const card = document.createElement("article");
    card.className = "recipe-card";

    const body = document.createElement("div");
    body.className = "recipe-body";

    const imagePath = recipe.imagePath || (Array.isArray(recipe.image) ? recipe.image[0] : null);
    if (imagePath) {
      const image = document.createElement("img");
      image.className = "recipe-image";
      image.src = `/api/recipe-image?path=${encodeURIComponent(imagePath)}`;
      image.alt = `${recipe.name || recipe.title || "Recipe"} image`;
      image.loading = "lazy";
      image.addEventListener("error", () => {
        image.remove();
        card.classList.add("recipe-card-no-image");
      });
      card.append(image);
    } else {
      card.classList.add("recipe-card-no-image");
    }

    const title = document.createElement("h3");
    title.className = "recipe-title";
    title.textContent = recipe.name || recipe.title || "Untitled Recipe";
    body.append(title);

    const metaBits = [];
    if (recipe.author?.name) metaBits.push(`By ${recipe.author.name}`);
    if (recipe.recipeYield) metaBits.push(`Yield: ${recipe.recipeYield}`);
    if (recipe.recipeCategory) metaBits.push(`Category: ${recipe.recipeCategory}`);
    if (recipe.recipeCuisine) metaBits.push(`Cuisine: ${recipe.recipeCuisine}`);
    const times = timeSummary(recipe);
    if (times) metaBits.push(times);
    if (metaBits.length) {
      const meta = document.createElement("p");
      meta.className = "recipe-meta";
      meta.textContent = metaBits.join(" • ");
      body.append(meta);
    }

    const keywordList = Array.isArray(recipe.keywords) ? recipe.keywords : [];
    const chips = renderChips([
      recipe.recipeCategory,
      recipe.recipeCuisine,
      ...keywordList.slice(0, 4),
    ]);
    if (chips) body.append(chips);

    const ingredientList = Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient : [];
    const instructionList = Array.isArray(recipe.recipeInstructions)
      ? recipe.recipeInstructions
      : [];
    const statBits = [];
    if (ingredientList.length) statBits.push(`${ingredientList.length} ingredients`);
    if (instructionList.length) statBits.push(`${instructionList.length} steps`);
    if (recipe.nutrition?.calories) statBits.push(`${recipe.nutrition.calories} cal`);
    if (statBits.length) {
      const stats = document.createElement("p");
      stats.className = "recipe-stats";
      stats.textContent = statBits.join(" • ");
      body.append(stats);
    }

    if (recipe.description) {
      const description = document.createElement("p");
      description.className = "recipe-description";
      description.textContent = recipe.description;
      body.append(description);
    }

    const actions = document.createElement("div");
    actions.className = "recipe-actions";

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "ghost-btn";
    const isSaved = savedIds.has(recipe.id);
    if (isSaved) {
      saveButton.textContent = "Saved";
      saveButton.disabled = true;
      const badge = document.createElement("span");
      badge.className = "saved-badge";
      badge.textContent = "In Favorites";
      actions.append(badge);
    } else {
      saveButton.textContent = "Save to Favorites";
      saveButton.addEventListener("click", () => {
        saveRecipeFromCard(recipe, saveButton);
      });
    }
    actions.append(saveButton);

    const detailsButton = document.createElement("button");
    detailsButton.type = "button";
    detailsButton.className = "ghost-btn";
    detailsButton.textContent = "View details";
    detailsButton.addEventListener("click", () => openRecipeDrawer(recipe));
    actions.append(detailsButton);
    body.append(actions);

    card.append(body);
    recipesView.append(card);
  }
  if (recipeFilterSummary) {
    recipeFilterSummary.textContent = `Showing ${recipes.length} of ${state.recipes.length} recipes`;
  }
  syncDynamicSelects();
}

function renderMembersList(members) {
  membersListView.textContent = "";
  if (!Array.isArray(members) || !members.length) {
    const empty = document.createElement("p");
    empty.className = "list-empty";
    empty.textContent = "No members loaded.";
    membersListView.append(empty);
    return;
  }
  for (const member of members) {
    const row = document.createElement("article");
    row.className = "member-row";
    const name = member.user?.name || member.userId;
    row.innerHTML = `<strong>${name}</strong><p class="member-meta">${member.userId} • ${formatRole(member.role)}</p>`;
    membersListView.append(row);
  }
}

function renderCollections(collections) {
  collectionsListView.textContent = "";
  if (!Array.isArray(collections) || !collections.length) {
    const empty = document.createElement("p");
    empty.className = "list-empty";
    empty.textContent = "No collections yet.";
    collectionsListView.append(empty);
    return;
  }
  for (const collection of collections) {
    const row = document.createElement("article");
    row.className = "member-row";
    const recipeCount = Array.isArray(collection.recipes) ? collection.recipes.length : 0;
    row.innerHTML = `<strong>${collection.name}</strong><p class="member-meta">${recipeCount} saved recipes</p>`;
    collectionsListView.append(row);
  }
}

function renderDashboard() {
  const status = state.status;
  if (!status || !status.initialized) {
    dashboardClub.textContent = "No club initialized yet.";
    dashboardMeetup.textContent = "Initialize a club to schedule a meetup.";
    dashboardRecipes.textContent = "Recipes will appear after your first meetup is scheduled.";
    renderOnboardingChecklist(status);
    return;
  }
  dashboardClub.textContent = `${status.club.name} (${status.counts.members} members)`;
  dashboardMeetup.textContent = status.upcomingMeetup
    ? `${status.upcomingMeetup.scheduledFor} • Theme: ${status.upcomingMeetup.theme || "TBD"}`
    : "No upcoming meetup yet.";
  dashboardRecipes.textContent = `${status.counts.upcomingMeetupRecipes} recipes submitted for upcoming meetup.`;
  renderOnboardingChecklist(status);
}

function renderOnboardingChecklist(status) {
  if (!onboardingChecklist) return;
  onboardingChecklist.textContent = "";
  const initialized = Boolean(status?.initialized);
  const checks = [
    {
      done: initialized,
      text: "Initialize your club",
    },
    {
      done: initialized && Number(status?.counts?.members || 0) >= 2,
      text: "Invite at least one member",
    },
    {
      done: initialized && Boolean(status?.upcomingMeetup),
      text: "Schedule your meetup",
    },
    {
      done: initialized && Number(status?.counts?.upcomingMeetupRecipes || 0) > 0,
      text: "Collect at least one recipe",
    },
  ];
  for (const check of checks) {
    const item = document.createElement("li");
    item.className = check.done ? "is-done" : "";
    item.textContent = `${check.done ? "Done" : "Next"}: ${check.text}`;
    onboardingChecklist.append(item);
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
}

function syncActiveRole() {
  const membership = state.members.find((entry) => entry.userId === state.activeUserId);
  state.activeRole = membership?.role || null;
  activeRoleBadge.textContent = formatRole(state.activeRole);
  applyRoleGates();
}

function syncDynamicSelects() {
  const memberOptions = state.members.map((member) => ({
    value: member.userId,
    label: `${member.user?.name || member.userId} (${member.userId})`,
  }));
  const transferOptions = memberOptions.filter((entry) => entry.value !== state.activeUserId);
  setSelectOptions(newHostUserSelect, transferOptions, { placeholderLabel: "Select new host" });
  setSelectOptions(removeMemberUserSelect, memberOptions, { placeholderLabel: "Select member" });
  const recipeOptions = state.recipes.map((recipe) => ({
    value: recipe.id,
    label: `${recipe.title || recipe.name || recipe.id} (${recipe.id})`,
  }));
  setSelectOptions(favoriteRecipeSelect, recipeOptions, { placeholderLabel: "Select recipe" });
}

function renderActiveUserSelect() {
  activeUserSelect.textContent = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select member";
  activeUserSelect.append(placeholder);
  for (const member of state.members) {
    const option = document.createElement("option");
    option.value = member.userId;
    option.textContent = `${member.user?.name || member.userId} (${member.userId})`;
    activeUserSelect.append(option);
  }
  activeUserSelect.value = state.activeUserId || "";
  if (!activeUserSelect.value) {
    activeUserSelect.value = "";
  }
  syncActiveRole();
  syncDynamicSelects();
}

function resolveDefaultActiveUser() {
  if (state.activeUserId && state.members.some((entry) => entry.userId === state.activeUserId))
    return;
  const hostId = state.status?.host?.id;
  if (hostId && state.members.some((entry) => entry.userId === hostId)) {
    state.activeUserId = hostId;
  } else if (state.members[0]?.userId) {
    state.activeUserId = state.members[0].userId;
  } else {
    state.activeUserId = "";
  }
  localStorage.setItem("cbc.activeUserId", state.activeUserId);
}

async function refreshStatus() {
  try {
    state.status = await api("/api/status");
    show(statusView, state.status);
    renderDashboard();
  } catch (error) {
    state.status = null;
    show(statusView, { error: error.message });
    renderDashboard();
    renderOnboardingChecklist(null);
  }
}

async function refreshMembers() {
  try {
    state.members = await api("/api/members");
  } catch {
    state.members = [];
  }
  show(membersView, state.members);
  renderMembersList(state.members);
  resolveDefaultActiveUser();
  renderActiveUserSelect();
}

async function loadRecipesForActiveUser({ render = false } = {}) {
  if (!state.activeUserId) {
    state.recipes = [];
    syncDynamicSelects();
    if (render) renderRecipes([]);
    return [];
  }
  const recipes = await api(`/api/recipes?actorUserId=${encodeURIComponent(state.activeUserId)}`);
  if (render) {
    renderRecipes(recipes);
  } else {
    state.recipes = recipes;
    syncDynamicSelects();
  }
  return recipes;
}

async function loadCollectionsForActiveUser({ render = false } = {}) {
  if (!state.activeUserId) {
    state.collections = [];
    if (getActiveRoute() === "recipes") renderRecipes(state.recipes);
    if (render) renderCollections([]);
    return [];
  }
  const collections = await api(
    `/api/collections?actorUserId=${encodeURIComponent(state.activeUserId)}`,
  );
  state.collections = collections;
  if (getActiveRoute() === "recipes") renderRecipes(state.recipes);
  if (render) renderCollections(collections);
  return collections;
}

function toIsoFromLocalInput(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString();
}

function setDefaultMeetupInput() {
  const input = document.querySelector("#scheduleForm [name='isoDateTime']");
  if (!input || input.value) return;
  const base = state.status?.upcomingMeetup?.scheduledFor;
  const date = base ? new Date(base) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  input.value = local;
}

async function buildRecipePayload(form) {
  const fields = bodyFrom(form);
  const ingredients = parseMultilineList(fields.ingredients);
  const instructionLines = parseMultilineList(fields.instructions);
  const instructions = instructionLines.map((text) => ({ text }));
  const keywords = parseCsvList(fields.keywords);
  const imageFile = form.querySelector("input[name='imageFile']")?.files?.[0] || null;
  const imageDataUrl = imageFile ? await readFileAsDataUrl(imageFile) : undefined;
  return {
    actorUserId: currentActorUserId(),
    title: fields.title,
    name: fields.title,
    description: optional(fields.description),
    content: optional(fields.description),
    imagePath: optional(fields.imagePath),
    recipeIngredient: ingredients.length ? ingredients : undefined,
    recipeInstructions: instructions.length ? instructions : undefined,
    prepTime: optional(fields.prepTime),
    cookTime: optional(fields.cookTime),
    totalTime: optional(fields.totalTime),
    recipeYield: optional(fields.recipeYield),
    recipeCategory: optional(fields.recipeCategory),
    recipeCuisine: optional(fields.recipeCuisine),
    keywords: keywords.length ? keywords : undefined,
    imageDataUrl,
    imageFileName: imageFile?.name,
  };
}

function bindForm(selector, fn) {
  const form = document.querySelector(selector);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFormNote(form);
    clearFlash();
    setFormBusy(form, true);
    try {
      const result = await fn(form);
      show(resultView, result);
      const message = result?.uiMessage || "Saved.";
      setFormNote(form, message, "success");
      setFlash(message, "success");
      await refreshStatus();
      await refreshMembers();
      if (getActiveRoute() === "recipes") {
        await loadRecipesForActiveUser({ render: true });
      } else if (getActiveRoute() === "cookbook") {
        await loadRecipesForActiveUser();
        await loadCollectionsForActiveUser({ render: true });
      } else {
        await loadRecipesForActiveUser();
      }
      setDefaultMeetupInput();
    } catch (error) {
      show(resultView, { error: error.message });
      setFormNote(form, error.message, "error");
      setFlash(error.message, "error", 4200);
    } finally {
      setFormBusy(form, false);
    }
  });
}

document.querySelector("#refresh").addEventListener("click", async () => {
  await refreshStatus();
  await refreshMembers();
  await loadRecipesForActiveUser();
  setDefaultMeetupInput();
});

async function onRouteEnter(route) {
  if (route === "recipes") {
    recipesView.textContent = "Loading recipes...";
    await loadRecipesForActiveUser({ render: true });
    return;
  }
  if (route === "cookbook") {
    collectionsListView.textContent = "Loading collections...";
    await loadRecipesForActiveUser();
    await loadCollectionsForActiveUser({ render: true });
  }
}

for (const button of routeButtons) {
  button.addEventListener("click", () => {
    const route = button.dataset.route;
    setActiveRoute(route);
    onRouteEnter(route).catch((error) => {
      show(resultView, { error: error.message });
      setFlash(error.message, "error", 4200);
    });
  });
}

window.addEventListener("hashchange", () => {
  const route = routeFromHash();
  setActiveRoute(route, { updateHash: false });
  onRouteEnter(route).catch((error) => {
    show(resultView, { error: error.message });
    setFlash(error.message, "error", 4200);
  });
});

if (closeDrawerBtn) {
  closeDrawerBtn.addEventListener("click", () => {
    recipeDrawer.close();
  });
}

if (recipeDrawer) {
  recipeDrawer.addEventListener("click", (event) => {
    if (event.target === recipeDrawer) {
      recipeDrawer.close();
    }
  });
}

activeUserSelect.addEventListener("change", () => {
  state.activeUserId = activeUserSelect.value;
  localStorage.setItem("cbc.activeUserId", state.activeUserId);
  syncActiveRole();
  const render = getActiveRoute() === "recipes";
  loadRecipesForActiveUser({ render }).catch((error) => {
    show(resultView, { error: error.message });
    setFlash(error.message, "error", 4200);
  });
});

if (recipeSearchInput) {
  recipeSearchInput.addEventListener("input", () => {
    state.recipeFilters.query = recipeSearchInput.value || "";
    renderFilteredRecipes();
  });
}

if (recipeCategoryFilterSelect) {
  recipeCategoryFilterSelect.addEventListener("change", () => {
    state.recipeFilters.category = recipeCategoryFilterSelect.value || "all";
    renderFilteredRecipes();
  });
}

if (clearRecipeFiltersBtn) {
  clearRecipeFiltersBtn.addEventListener("click", () => {
    state.recipeFilters = { query: "", category: "all" };
    if (recipeSearchInput) recipeSearchInput.value = "";
    if (recipeCategoryFilterSelect) recipeCategoryFilterSelect.value = "all";
    renderFilteredRecipes();
  });
}

bindForm("#initClubForm", async (form) =>
  api("/api/club/init", {
    method: "POST",
    body: JSON.stringify(bodyFrom(form)),
  }).then((payload) => ({ ...payload, uiMessage: "Club initialized." })),
);

bindForm("#addMemberForm", async (form) => {
  assertManager();
  const actorUserId = currentActorUserId();
  const fields = bodyFrom(form);
  const user = await api("/api/users", {
    method: "POST",
    body: JSON.stringify({ name: fields.name }),
  });
  const membership = await api("/api/members/invite", {
    method: "POST",
    body: JSON.stringify({ actorUserId, userId: user.id }),
  });
  return { user, membership, uiMessage: "Member invited." };
});

bindForm("#scheduleForm", async (form) => {
  assertHost();
  const actorUserId = currentActorUserId();
  const fields = bodyFrom(form);
  const isoDateTime = toIsoFromLocalInput(fields.isoDateTime);
  if (!isoDateTime) throw new Error("Please choose a valid date and time.");
  return api("/api/meetup/schedule", {
    method: "POST",
    body: JSON.stringify({ actorUserId, isoDateTime }),
  }).then((payload) => ({ ...payload, uiMessage: "Meetup scheduled." }));
});

bindForm("#setHostForm", async (form) => {
  assertHost();
  const actorUserId = currentActorUserId();
  const fields = bodyFrom(form);
  if (!fields.newHostUserId) throw new Error("Select a new host.");
  return api("/api/host/set", {
    method: "POST",
    body: JSON.stringify({ actorUserId, newHostUserId: fields.newHostUserId }),
  }).then((payload) => ({ ...payload, uiMessage: "Host transferred." }));
});

bindForm("#addRecipeForm", async (form) =>
  api("/api/recipes", {
    method: "POST",
    body: JSON.stringify(await buildRecipePayload(form)),
  }).then(async (payload) => {
    await loadRecipesForActiveUser();
    return { ...payload, uiMessage: "Recipe added." };
  }),
);

bindForm("#listRecipesForm", async () => {
  const recipes = await loadRecipesForActiveUser({ render: true });
  return { recipeCount: recipes.length, uiMessage: `Loaded ${recipes.length} recipes.` };
});

bindForm("#purgeRecipesForm", async () => {
  assertManager();
  const actorUserId = currentActorUserId();
  const result = await api("/api/recipes/purge", {
    method: "POST",
    body: JSON.stringify({ actorUserId, mode: "all" }),
  });
  const recipes = await loadRecipesForActiveUser({ render: true });
  return { ...result, recipeCount: recipes.length, uiMessage: "Upcoming recipes cleared." };
});

bindForm("#removeMemberForm", async (form) => {
  assertManager();
  const actorUserId = currentActorUserId();
  const fields = bodyFrom(form);
  if (!fields.userId) throw new Error("Select a member.");
  return api("/api/members/remove", {
    method: "POST",
    body: JSON.stringify({ actorUserId, userId: fields.userId }),
  }).then((payload) => ({ ...payload, uiMessage: "Member removed." }));
});

bindForm("#favoriteForm", async (form) => {
  const fields = bodyFrom(form);
  if (!fields.recipeId) throw new Error("Load recipes and select one to favorite.");
  const { favorite, collection } = await saveRecipeToFavorites({ recipeId: fields.recipeId });
  await loadCollectionsForActiveUser({ render: getActiveRoute() === "cookbook" });
  return { favorite, collection, uiMessage: "Saved to Favorites." };
});

bindForm("#loadCollectionsForm", async () => {
  const collections = await loadCollectionsForActiveUser({ render: true });
  return {
    collections: collections.length,
    uiMessage: `Loaded ${collections.length} collections.`,
  };
});

async function initialize() {
  setActiveRoute(routeFromHash(), { updateHash: false });
  await refreshStatus();
  await refreshMembers();
  await loadRecipesForActiveUser();
  await loadCollectionsForActiveUser({ render: true });
  setDefaultMeetupInput();
}

initialize();
