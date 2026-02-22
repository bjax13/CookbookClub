const statusView = document.querySelector("#statusView");
const recipesView = document.querySelector("#recipesView");
const resultView = document.querySelector("#resultView");

function show(target, value) {
  target.textContent = JSON.stringify(value, null, 2);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status}).`);
  }
  return payload;
}

async function refreshStatus() {
  try {
    const status = await api("/api/status");
    show(statusView, status);
  } catch (error) {
    show(statusView, { error: error.message });
  }
}

function bodyFrom(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function bindForm(selector, fn) {
  const form = document.querySelector(selector);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const result = await fn(form);
      show(resultView, result);
      await refreshStatus();
    } catch (error) {
      show(resultView, { error: error.message });
    }
  });
}

document.querySelector("#refresh").addEventListener("click", refreshStatus);

bindForm("#initClubForm", async (form) =>
  api("/api/club/init", {
    method: "POST",
    body: JSON.stringify(bodyFrom(form))
  })
);

bindForm("#addMemberForm", async (form) => {
  const user = await api("/api/users", {
    method: "POST",
    body: JSON.stringify(bodyFrom(form))
  });
  const membership = await api("/api/members/invite", {
    method: "POST",
    body: JSON.stringify({ actorUserId: "user_1", userId: user.id })
  });
  return { user, membership };
});

bindForm("#scheduleForm", async (form) =>
  api("/api/meetup/schedule", {
    method: "POST",
    body: JSON.stringify(bodyFrom(form))
  })
);

bindForm("#addRecipeForm", async (form) =>
  api("/api/recipes", {
    method: "POST",
    body: JSON.stringify(bodyFrom(form))
  })
);

bindForm("#listRecipesForm", async (form) => {
  const params = new URLSearchParams(bodyFrom(form));
  const recipes = await api(`/api/recipes?${params.toString()}`);
  show(recipesView, recipes);
  return { recipeCount: recipes.length };
});

refreshStatus();
