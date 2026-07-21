import { Link } from 'react-router-dom';
import { Box, Button, Card, CardActionArea, CardContent, Chip, Stack, Typography } from '@mui/material';
import { Flame, Plus, Salad, Sparkles } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { ROUTES } from '@constants/routes';
import { formatCurrency } from '@lib/format';
import { useAppDispatch } from '@app/hooks';
import { addItem } from '@features/cart/cartSlice';
import { FavoriteButton } from '@features/favorites/components/FavoriteButton';
import type { Product } from '../types';

const TAG_LABEL: Record<string, string> = {
  vegano: 'Vegano',
  vegetariano: 'Vegetariano',
  'alto-en-proteina': 'Alto en proteína',
  'sin-gluten': 'Sin gluten',
  'bajo-en-calorias': 'Bajo en calorías',
};

export const ProductCard = ({ product }: { product: Product }) => {
  const dispatch = useAppDispatch();
  const isBuilder = product.type === 'CUSTOMIZABLE';
  const to = isBuilder ? ROUTES.builder : ROUTES.product(product.slug);
  // Se puede anadir directo solo si es FIJO y tenemos su variante por defecto.
  const canQuickAdd = !isBuilder && product.defaultVariantId !== null;

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
      sx={{
        position: 'relative',
        height: '100%',
        overflow: 'hidden',
        opacity: product.isAvailable ? 1 : .62,
        transition: 'transform 220ms ease, box-shadow 220ms ease, border-color 220ms ease',
        '&:hover': product.isAvailable ? { transform: 'translateY(-5px)', borderColor: 'primary.light', boxShadow: '0 20px 50px rgba(20,60,40,.13)' } : undefined,
      }}
    >
      <FavoriteButton
        className="absolute right-3 top-3 z-10"
        product={{ productId: product.id, slug: product.slug, name: product.name, imageUrl: product.imageUrl, priceFrom: product.priceFrom, type: product.type }}
      />

      <CardActionArea component={Link} to={to} disabled={!product.isAvailable} sx={{ display: 'flex', height: '100%', flexDirection: 'column', alignItems: 'stretch' }}>
        <Box sx={{ position: 'relative', display: 'grid', height: { xs: 190, sm: 210 }, flexShrink: 0, placeItems: 'center', overflow: 'hidden', bgcolor: 'action.hover' }}>
          {product.imageUrl ? (
            <Box component="img" src={product.imageUrl} alt={product.name} loading="lazy" sx={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 450ms ease', '.MuiCard-root:hover &': { transform: 'scale(1.045)' } }} />
          ) : (
            <Salad size={46} color="#8ed1ac" />
          )}
          {isBuilder && <Chip icon={<Sparkles size={14} />} label="Personalizable" color="secondary" size="small" sx={{ position: 'absolute', left: 12, bottom: 12 }} />}
        </Box>

        <CardContent sx={{ display: 'flex', flex: 1, flexDirection: 'column', p: 2.25 }}>
          <Typography component="h3" variant="h6" sx={{ fontSize: 17, pr: 1 }}>{product.name}</Typography>
          {product.description && <Typography variant="body2" color="text.secondary" sx={{ mt: .75, display: '-webkit-box', overflow: 'hidden', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2 }}>{product.description}</Typography>}

          {product.dietaryTags.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: .6, mt: 1.5 }}>
              {product.dietaryTags.slice(0, 3).map((tag) => <Chip key={tag} label={TAG_LABEL[tag] ?? tag} size="small" variant="outlined" sx={{ height: 24, fontSize: 10.5 }} />)}
            </Box>
          )}

          <Stack direction="row" spacing={1} sx={{ mt: 'auto', pt: 2, alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <Box>
              {isBuilder && <Typography variant="caption" color="text.secondary">Desde</Typography>}
              {/* Un FIJO muestra el precio de la variante que de verdad se anade, no el
                  minimo entre variantes: si no, la tarjeta diria un precio y el carrito otro. */}
              <Typography sx={{ color: 'primary.dark', fontSize: 21, fontWeight: 850, lineHeight: 1.15 }}>{formatCurrency(isBuilder ? product.priceFrom : (product.defaultVariantPrice || product.priceFrom))}</Typography>
            </Box>
            {product.nutrition && (
              <Stack direction="row" spacing={.5} sx={{ alignItems: 'center', color: 'text.secondary' }}>
                <Flame size={14} />
                <Typography variant="caption">{Math.round(product.nutrition.calories)} kcal · {Math.round(product.nutrition.protein)}g prot.</Typography>
              </Stack>
            )}
          </Stack>
          {!product.isAvailable && <Typography variant="caption" color="error.main" sx={{ mt: 1, fontWeight: 700 }}>No disponible en tu sucursal</Typography>}
        </CardContent>
      </CardActionArea>

      {/* Accion FUERA del CardActionArea: anidar un boton dentro de un enlace es HTML
          invalido. FIJO -> anade directo; PERSONALIZABLE -> lleva al constructor. */}
      <Box sx={{ p: 2.25, pt: 0 }}>
        {isBuilder ? (
          <Button
            component={Link}
            to={ROUTES.builder}
            fullWidth
            variant="outlined"
            startIcon={<Sparkles size={16} />}
            disabled={!product.isAvailable}
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
          >
            Añadir al carrito
          </Button>
        )}
      </Box>
    </Card>
  );
};
