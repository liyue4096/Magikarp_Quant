#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { MagikarpCdkStack } from '../lib/magikarp_cdk-stack';

const app = new cdk.App();

// Deploy to us-west-2 using your AWS CLI configured account
new MagikarpCdkStack(app, 'MagikarpCdkStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-west-2'
  },
  description: 'Magikarp Trading System - Main Stack',
});