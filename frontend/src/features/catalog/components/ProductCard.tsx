import { Link } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Stack,
  Typography,
} from '@mui/material';
import { AlertTriangle, Flame, Plus, Sparkles, Star } from 'lucide-react';
import { ProductMedia } from '@components/ui/ProductMedia';
import { TagList } from '@components/ui/DietaryTag';
import toast from '@components/mui/MuiToast';
import { ROUTES } from '@constants/routes';
import { formatCurrency } from '@lib/format';
import { useAppDispatch } from '@app/hooks';
import { addItem } from '@features/cart/cartSlice';
import { FavoriteButton } from '@features/favorites/components/FavoriteButton';
import { AvailabilityAlertButton } from './AvailabilityAlertButton';
import type { Allergen, Product } from '../types';

interface ProductCardProps {
  product: Product;
  /** Alérgenos declarados en el perfil alimentario del cliente. */
  allergenAlerts?: Allergen[];
}

export const ProductCard = ({ product, allergenAlerts }: ProductCardProps) => {
  const dispatch = useAppDispatch();
  const isBuilder = product.type === 'CUSTOMIZABLE';
  // El aviso solo aparece si el plato choca con lo que el cliente declaró; si no, nada cambia.
  const allergenWarnings = (allergenAlerts ?? []).filter((allergen) =>
    product.allergens.includes(allergen.code),
  );
  const to = isBuilder ? ROUTES.builder : ROUTES.product(product.slug);
  const canQuickAdd = !isBuilder && product.defaultVariantId !== null;
  const displayPrice = isBuilder
    ? product.priceFrom
    : product.defaultVariantPrice || product.priceFrom;

  const handleQuickAdd = () => {
    if (product.defaultVariantId === null) return;
    dispatch(
      addItem({
        id: crypto.randomUUID(),
        productId: product.id,
        variantId: product.defaultVariantId,
        name: product.name,
        variantName: product.defaultVariantName ?? '',
        imageUrl: product.imageUrl,
        quantity: 1,
        unitPrice: product.defaultVariantPrice,
        extrasTotal: 0,
        lineTotal: product.defaultVariantPrice,
        selections: [],
        nutrition: product.nutrition,
      }),
    );
    toast.success(`${product.name} agregado al carrito`);
  };

  return (
    <Card
      variant="outlined"
      sx={{
        position: 'relative',
        display: 'flex',
        height: '100%',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRadius: 'var(--radius-card)',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        opacity: product.isAvailable ? 1 : .68,
        boxShadow: 'var(--shadow-e2)',
        transition: 'transform 220ms ease, box-shadow 220ms ease, border-color 220ms ease',
        '&:hover': product.isAvailable
          ? {
              transform: 'translateY(-3px)',
              borderColor: 'primary.light',
              boxShadow: 'var(--shadow-e3)',
            }
          : undefined,
      }}
    >
      <FavoriteButton
        className="absolute right-3 top-3 z-20 border border-white/70 bg-white/95 p-2.5 shadow-lg backdrop-blur"
        product={{
          productId: product.id,
          slug: product.slug,
          name: product.name,
          imageUrl: product.imageUrl,
          priceFrom: product.priceFrom,
          type: product.type,
        }}
      />

      <CardActionArea
        component={Link}
        to={to}
        sx={{
          display: 'flex',
          flex: 1,
          flexDirection: 'column',
          alignItems: 'stretch',
          justifyContent: 'flex-start',
        }}
      >
        <ProductMedia src={product.imageUrl} alt={product.name} ratio="4/3" className="shrink-0">
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(180deg, transparent 58%, rgba(28,10,28,.28) 100%)',
              pointerEvents: 'none',
            }}
          />
          <Stack
            direction="row"
            spacing={.75}
            sx={{ position: 'absolute', bottom: 12, left: 12, right: 56, flexWrap: 'wrap' }}
          >
            {product.isFeatured && (
              <Chip
                icon={<Star size={13} />}
                label="Recomendado"
                size="small"
                sx={{ borderRadius: 'var(--radius-pill)', bgcolor: 'rgba(255,255,255,.94)', fontWeight: 800 }}
              />
            )}
            {isBuilder && (
              <Chip
                icon={<Sparkles size={13} />}
                label="Personalizable"
                color="secondary"
                size="small"
                sx={{ borderRadius: 'var(--radius-pill)', fontWeight: 850 }}
              />
            )}
          </Stack>
          {!product.isAvailable && (
            <Chip
              label="Temporalmente no disponible"
              size="small"
              sx={{
                position: 'absolute',
                bottom: 12,
                left: 12,
                bgcolor: 'rgba(255,255,255,.94)',
                borderRadius: 'var(--radius-pill)',
                color: 'error.main',
                fontWeight: 800,
              }}
            />
          )}
        </ProductMedia>

        <CardContent sx={{ display: 'flex', flex: 1, flexDirection: 'column', p: { xs: 2, sm: 2.5 } }}>
          <Typography
            component="h3"
            variant="h6"
            sx={{ pr: 1, fontSize: 18, fontWeight: 850, letterSpacing: '-.015em', lineHeight: 1.25 }}
          >
            {product.name}
          </Typography>
          {product.description && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                mt: .8,
                display: '-webkit-box',
                minHeight: 40,
                overflow: 'hidden',
                lineHeight: 1.45,
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: 2,
              }}
            >
              {product.description}
            </Typography>
          )}

          {allergenWarnings.length > 0 && (
            <Stack direction="row" sx={{ mt: 1.5, flexWrap: 'wrap', gap: .75 }}>
              {allergenWarnings.map((allergen) => (
                <Chip
                  key={allergen.code}
                  icon={<AlertTriangle size={13} />}
                  label={`Contiene ${allergen.name.toLocaleLowerCase('es-PE')}`}
                  size="small"
                  color="error"
                  variant="outlined"
                  sx={{ borderRadius: 'var(--radius-pill)', fontWeight: 800 }}
                />
              ))}
            </Stack>
          )}

          {product.dietaryTags.length > 0 && (
            <TagList tags={product.dietaryTags} max={2} className="mt-3" />
          )}

          <Stack
            direction="row"
            spacing={1}
            sx={{ mt: 'auto', pt: 2.25, alignItems: 'flex-end', justifyContent: 'space-between' }}
          >
            <Box>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', fontWeight: 650, lineHeight: 1.2 }}
              >
                {isBuilder ? 'Desde' : 'Precio'}
              </Typography>
              <Typography
                sx={{ color: 'primary.dark', fontSize: 22, fontWeight: 900, letterSpacing: '-.02em', lineHeight: 1.2 }}
              >
                {formatCurrency(displayPrice)}
              </Typography>
            </Box>
            {product.nutrition && (
              <Stack
                direction="row"
                spacing={.6}
                sx={{
                  alignItems: 'center',
                  borderRadius: 'var(--radius-pill)',
                  bgcolor: 'action.hover',
                  px: 1.1,
                  py: .65,
                  color: 'text.secondary',
                }}
              >
                <Flame size={14} />
                <Typography variant="caption" sx={{ fontWeight: 750, whiteSpace: 'nowrap' }}>{Math.round(product.nutrition.calories)} kcal</Typography>
                <Box component="span" sx={{ width: 1, height: 12, bgcolor: 'divider' }} />
                <Typography variant="caption" sx={{ fontWeight: 750, whiteSpace: 'nowrap' }}>{Math.round(product.nutrition.protein)} g prot.</Typography>
              </Stack>
            )}
          </Stack>
        </CardContent>
      </CardActionArea>

      <Box sx={{ borderTop: '1px solid', borderColor: 'divider', p: { xs: 2, sm: 2.5 }, pt: { xs: 1.5, sm: 1.75 } }}>
        {!product.isAvailable ? (
          <AvailabilityAlertButton product={product} fullWidth compact />
        ) : isBuilder ? (
          <Button
            component={Link}
            to={ROUTES.builder}
            fullWidth
            variant="outlined"
            startIcon={<Sparkles size={16} />}
            disabled={!product.isAvailable}
            sx={{ minHeight: 44 }}
          >
            Personalizar
          </Button>
        ) : (
          <Button
            fullWidth
            variant="contained"
            startIcon={<Plus size={16} />}
            disabled={!product.isAvailable || !canQuickAdd}
            onClick={handleQuickAdd}
            sx={{ minHeight: 44 }}
          >
            Añadir al carrito
          </Button>
        )}
      </Box>
    </Card>
  );
};
