export interface ProductReview {
  id: number;
  rating: number;
  comment: string | null;
  verifiedPurchase: boolean;
  authorName: string;
  createdAt: string;
}

export interface ProductReviews {
  summary: { average: number; count: number };
  reviews: ProductReview[];
}

export interface PendingReview {
  orderItemId: number;
  orderNumber: string;
  deliveredAt: string | null;
  productId: number;
  productName: string;
  productSlug: string | null;
  imageUrl: string | null;
}

export interface MyReview {
  id: number;
  productId: number;
  productName: string;
  productSlug: string | null;
  imageUrl: string | null;
  orderNumber: string | null;
  rating: number;
  comment: string | null;
  status: 'PUBLISHED' | 'HIDDEN';
  verifiedPurchase: boolean;
  createdAt: string;
  deliveredAt: string | null;
}
