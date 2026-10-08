export type Category = "All" | "SUV" | "Sedan" | "Sports" | "Luxury";

export interface Car {
  car_id: string;
  brand: string;
  model: string;
  category: Exclude<Category, "All">;
  price_per_day: number;
  fuel_type: string;
  transmission: string;
  seats: number;
  rating: number;
  reviews_count: number;
  available: boolean;
  image: string;
  gallery: string[];
  features: string[];
  description: string;
  horsepower: number;
  top_speed: number;
  acceleration: string;
}

export interface Booking {
  booking_id: string;
  user_id: string;
  car_id: string;
  car_brand: string;
  car_model: string;
  car_image: string;
  pickup_location: string;
  drop_location: string;
  pickup_datetime: string;
  drop_datetime: string;
  days: number;
  subtotal: number;
  discount: number;
  taxes: number;
  total: number;
  coupon_code?: string | null;
  status: "pending" | "upcoming" | "completed" | "cancelled" | "declined";
  payment_method: string;
  created_at: string;
  paid?: boolean;
  request_expires_at?: string | null;
  decline_reason?: string | null;
  decline_note?: string | null;
}

export interface RenterProfile {
  full_name: string;
  phone: string;
  dob: string;
  address_line1: string;
  city: string;
  state: string;
  postcode: string;
  license_no: string;
  license_expiry: string;
}

export interface RenterCard {
  user_id: string;
  name: string;
  picture?: string | null;
  email: string;
  phone: string;
  dob: string;
  address: string;
  license_no: string;
  license_expiry: string;
  license_verified: boolean;
  id_verified: boolean;
  member_since: string;
  trips: number;
  cancellations: number;
  rating: number | null;
}

export interface User {
  user_id: string;
  email?: string | null;
  username?: string | null;
  name: string;
  picture?: string | null;
  wallet_balance: number;
  is_vendor?: boolean;
  role?: "user" | "vendor" | "admin";
  status?: "active" | "blocked" | "suspended";
  verified?: boolean;
}

export interface Review {
  review_id: string;
  user_id: string;
  user_name: string;
  user_picture?: string | null;
  car_id: string;
  rating: number;
  comment: string;
  created_at: string;
}
