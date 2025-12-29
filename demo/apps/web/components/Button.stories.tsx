import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';

const meta = {
  title: 'Components/Button',
  component: Button,
  args: {
    children: 'Click me'
  }
} satisfies Meta<typeof Button>;

export default meta;

export const Primary: StoryObj<typeof Button> = {
  args: { variant: 'primary' }
};

export const Secondary: StoryObj<typeof Button> = {
  args: { variant: 'secondary' }
};
