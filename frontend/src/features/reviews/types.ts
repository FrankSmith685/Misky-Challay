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
