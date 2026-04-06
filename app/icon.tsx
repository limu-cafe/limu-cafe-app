import { ImageResponse } from 'next/og';

export const size = {
  width: 512,
  height: 512,
};

export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #2c1a0e 0%, #5d7c5b 100%)',
          color: '#fdfaf5',
          fontSize: 220,
          borderRadius: 96,
        }}
      >
        ☕
      </div>
    ),
    size
  );
}
