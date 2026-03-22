export type ClubPolicy = "open" | "closed";

export type MemberRole = "host" | "admin" | "co_admin" | "member";

export type ApiError = {
  error: string;
};

export type User = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
};

export type Membership = {
  id: string;
  clubId: string;
  userId: string;
  role: MemberRole;
  cookbookAccessFrom: string | null;
  user: User;
};

export type Club = {
  id: string;
  name: string;
  hostUserId: string;
  membershipPolicy: ClubPolicy;
};

export type Meetup = {
  id: string;
  clubId: string;
  hostUserId: string;
  scheduledFor: string;
  theme: string;
  status: "upcoming" | "past";
};

export type RecipeInstruction = {
  text: string;
};

export type Recipe = {
  id: string;
  clubId: string;
  meetupId: string;
  authorUserId: string;
  title?: string;
  name?: string;
  description?: string | null;
  imagePath?: string | null;
  recipeIngredient?: string[];
  recipeInstructions?: RecipeInstruction[];
  prepTime?: string | null;
  cookTime?: string | null;
  totalTime?: string | null;
  recipeYield?: string | null;
  recipeCategory?: string | null;
  recipeCuisine?: string | null;
  keywords?: string[];
  author?: User;
};

export type Favorite = {
  id: string;
  userId: string;
  recipeId: string;
  createdAt: string;
};

export type PersonalCollection = {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  recipes: Recipe[];
};

export type AuthSession = {
  token: string;
  expiresAt: string;
  user: {
    id: string;
    name: string;
  };
};

export type ClubStatus = {
  initialized: boolean;
  storage: string;
  dataFile: string;
  club?: {
    id: string;
    name: string;
    membershipPolicy: ClubPolicy;
  };
  host?: {
    id: string;
    name: string;
  };
  upcomingMeetup?: {
    id: string;
    scheduledFor: string;
    theme: string;
    status: "upcoming" | "past";
  } | null;
  counts: {
    users?: number;
    members?: number;
    recipes?: number;
    upcomingMeetupRecipes?: number;
    pendingNotifications?: number;
  };
};
