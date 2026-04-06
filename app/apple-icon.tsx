import { ImageResponse } from 'next/og';

export const size = {
  width: 180,
  height: 180,
};

export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#2c1a0e',
          color: '#fdfaf5',
          fontSize: 90,
          borderRadius: 40,
        }}
      >
        ☕
      </div>
    ),
    size
  );
}
