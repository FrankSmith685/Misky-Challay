import { Link } from 'react-router-dom';
import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Stack,
  Typography,
} from '@mui/material';
import { AlertTriangle, Clock3, Flame, Plus, Sparkles, Star } from 'lucide-react';
import { ProductMedia } from '@components/ui/ProductMedia';
import { Button } from '@components/ui/Button';
import { TagList } from '@components/ui/DietaryTag';
import { formatCurrency } from '@lib/format';
import { FavoriteButton } from '@features/favorites/components/FavoriteButton';
import { AvailabilityAlertButton } from './AvailabilityAlertButton';
import { productImage } from '../productImage';
import type { Allergen, Product } from '../types';
import { preparationLabel, productHref, PRODUCT_FAMILIES } from '../pastry';

interface ProductCardProps {
  product: Product;
  /** Alérgenos declarados en el perfil alimentario del cliente. */
  allergenAlerts?: Allergen[];
}

export const ProductCard = ({ product, allergenAlerts }: ProductCardProps) => {
  const isBuilder = product.cakeSaleMode === 'SEMI_CUSTOM' || product.cakeSaleMode === 'ADVANCED';
  const displayImage = productImage(product);
  // El aviso solo aparece si el plato choca con lo que el cliente declaró; si no, nada cambia.
  const allergenWarnings = (allergenAlerts ?? []).filter((allergen) =>
    product.allergens.includes(allergen.code),
  );
  const to = productHref(product);
  const displayPrice = isBuilder
    ? product.priceFrom
    : product.defaultVariantPrice || product.priceFrom;

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
        boxShadow: '0 4px 20px rgba(70,42,31,.045)',
        transition: 'transform 220ms ease, box-shadow 220ms ease, border-color 220ms ease',
        '&:hover': product.isAvailable
          ? {
              transform: 'translateY(-4px)',
              borderColor: 'primary.200',
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
          imageUrl: displayImage,
          priceFrom: product.priceFrom,
          type: product.type,
        }}
      />

      <CardActionArea
        component={Link}
        to={to}
        state={isBuilder ? { customCakeEntry: true } : undefined}
        sx={{
          display: 'flex',
          flex: 1,
          flexDirection: 'column',
          alignItems: 'stretch',
          justifyContent: 'flex-start',
        }}
      >
        <ProductMedia src={displayImage} alt={product.name} ratio="4/3" className="max-h-[18rem] shrink-0 bg-surface-muted sm:max-h-[20rem] xl:max-h-[22rem]">
            {(isBuilder || displayImage?.endsWith('.svg')) && displayImage && <Chip
            label="Imagen referencial"
            size="small"
            sx={{ position: 'absolute', top: 12, left: 12, zIndex: 1, bgcolor: 'rgba(255,255,255,.94)', borderRadius: 'var(--radius-pill)', fontWeight: 700 }}
          />}
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
            {(product.salesCount ?? 0) > 0 && (
              <Chip
                icon={<Flame size={13} />}
                label="Más vendido"
                size="small"
                color="secondary"
                sx={{ borderRadius: 'var(--radius-pill)', fontWeight: 850 }}
              />
            )}
            {isBuilder && (
              <Chip
                icon={<Sparkles size={13} />}
                label={product.family && product.family !== 'CAKE' ? 'Personalizable' : 'Crea tu torta'}
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
            sx={{ pr: 1, fontSize: { xs: 19, sm: 21 }, fontWeight: 800, letterSpacing: '-.025em', lineHeight: 1.25 }}
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

          <Typography variant="caption" color="text.secondary" sx={{ mt: 1.25 }}>{product.family ? `${PRODUCT_FAMILIES[product.family]} · ` : ''}{preparationLabel(product)}</Typography>
          {product.defaultVariantName && <Typography variant="caption" color="text.secondary" sx={{ mt: .5 }}>{product.defaultVariantName}</Typography>}

          {product.allergens.length > 0 && <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, lineHeight: 1.6 }}>
            {isBuilder ? 'Según la personalización, puede incluir' : 'Contiene'}: {product.allergens.map((code) => ({ gluten: 'gluten', lacteos: 'lácteos', huevo: 'huevo', mani: 'maní', 'frutos-secos': 'frutos secos', soya: 'soya', sesamo: 'sésamo', pescado: 'pescado', mariscos: 'mariscos' }[code] ?? code)).join(', ')}
          </Typography>}

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
                sx={{ color: 'text.primary', fontSize: 24, fontWeight: 700, letterSpacing: '-.025em', lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}
              >
                {formatCurrency(displayPrice)}
              </Typography>
            </Box>
          </Stack>
        </CardContent>
      </CardActionArea>

      <Box sx={{ borderTop: '1px solid', borderColor: 'divider', p: { xs: 2, sm: 2.5 }, pt: { xs: 1.5, sm: 1.75 } }}>
        {!product.isAvailable ? (
          <AvailabilityAlertButton product={product} fullWidth compact />
        ) : isBuilder ? (
            <Button
            component={Link}
            to={to}
            state={{ customCakeEntry: true }}
            fullWidth
              variant="outline"
              size="md"
              leftIcon={<Sparkles size={16} />}
            disabled={!product.isAvailable}
            sx={{ minHeight: 44 }}
          >
            {product.cakeSaleMode === 'ADVANCED' ? 'Solicitar diseño' : 'Personalizar'}
          </Button>
        ) : product.preparationMode === 'READY_STOCK' ? (
          <Button
            component={Link}
            to={to}
            fullWidth
            variant="primary"
            size="md"
            leftIcon={<Clock3 size={16} />}
            disabled={!product.isAvailable}
            sx={{ minHeight: 44 }}
          >
            Ver disponibilidad
          </Button>
        ) : (
          <Button
            component={Link}
            to={to}
            fullWidth
            variant="primary"
            size="md"
            leftIcon={<Plus size={16} />}
            disabled={!product.isAvailable}
            sx={{ minHeight: 44 }}
          >
            Elegir presentación y fecha
          </Button>
        )}
      </Box>
    </Card>
  );
};
