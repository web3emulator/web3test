const AWS = require('aws-sdk');
const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const cors = require('cors');

dotenv.config();

// AWS SDK configuration
AWS.config.update({
  region: process.env.AWS_REGION, // Set your AWS region here
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const app = express();

// Middleware to parse JSON request body
app.use(bodyParser.json());
app.use(cors());

// Create a new DynamoDB instance
const dynamodb = new AWS.DynamoDB();

// Helper function to fetch the count of usernames in the table
async function fetchUsernameCount() {
  const scanParams = {
    TableName: 'republicofgamers', // Replace 'republicofgamers' with your DynamoDB table name
    Select: 'COUNT',
    FilterExpression: 'attribute_exists(username)',
  };

  try {
    const scanResult = await dynamodb.scan(scanParams).promise();
    return scanResult.Count || 0;
  } catch (err) {
    console.error('Error fetching usernames count:', err);
    return 0;
  }
}

// Handle user registration
async function handleRegistration(username, userAddress) {
  const maxUsers = 500; // set the maxUsers here

  // Check the current number of users using the fetchUsernameCount function
  try {
    const currentCount = await fetchUsernameCount();
    if (currentCount >= maxUsers) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'User limit reached, cannot add more users.' }),
      };
    }
  } catch (err) {
    console.error('Error fetching usernames count:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Error fetching usernames count.' }),
    };
  }

  // Check if username already exists in the table
  const scanParams = {
    TableName: 'republicofgamers', // Replace 'republicofgamers' with your DynamoDB table name
    FilterExpression: 'username = :username',
    ExpressionAttributeValues: {
      ':username': { S: username },
    },
  };

  try {
    const scanResult = await dynamodb.scan(scanParams).promise();
    const users = scanResult.Items;

    if (users.length > 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Username already exists. Please choose a different username.' }),
      };
    } else {
      // Check if userAddress already exists in the table
      const getItemParams = {
        TableName: 'republicofgamers', // Replace 'republicofgamers' with your DynamoDB table name
        Key: {
          ethereum_address: { S: userAddress },
        },
      };

      const getItemResult = await dynamodb.getItem(getItemParams).promise();
      const userItem = getItemResult.Item;

      if (userItem) {
        // User already exists, update the account
        const updateItemParams = {
          TableName: 'republicofgamers', // Replace 'republicofgamers' with your DynamoDB table name
          Key: {
            ethereum_address: { S: userAddress },
          },
          UpdateExpression: 'SET username = :username',
          ExpressionAttributeValues: {
            ':username': { S: username },
          },
        };

        await dynamodb.updateItem(updateItemParams).promise();
        return {
          statusCode: 200,
          body: JSON.stringify({ message: 'User account updated successfully' }),
        };
      } else {
        // User doesn't exist, create a new account
        const favorites = ["sf2.zip", "s3comp.zip", "tf4.zip"];

        const item = {
          TableName: 'republicofgamers', // Replace 'republicofgamers' with your DynamoDB table name
          Item: {
            ethereum_address: { S: userAddress },
            username: { S: username },
            favorites: { SS: favorites },
          },
        };

        await dynamodb.putItem(item).promise();
        return {
          statusCode: 200,
          body: JSON.stringify({ message: 'User account created successfully' }),
        };
      }
    }
  } catch (err) {
    console.error('Error registering user:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Error registering user.' }),
    };
  }
}

// Your main handler function for the AWS Lambda
exports.handler = async (event, context) => {
  // Capture the HTTP method and request path from the event
  const { httpMethod, path } = event;

  // Handle different HTTP methods and paths
  switch (httpMethod) {
    case 'POST':
      if (path === '/register') {
        // Handle user registration
        const { username, userAddress } = JSON.parse(event.body);
        const result = await handleRegistration(username, userAddress);
        return result;
      }
      break;
      
    case 'GET':
      if (path === '/fetch-username-count') {
        // Handle fetch-username-count route
        try {
          const count = await fetchUsernameCount();
          return {
            statusCode: 200,
            body: JSON.stringify({ count }),
          };
        } catch (err) {
          console.error('Error fetching usernames count:', err);
          return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Error fetching usernames count.' }),
          };
        }
      } else if (path.startsWith('/getUsernameByAddress/')) {
        // Handle getUsernameByAddress route
        const address = path.substring('/getUsernameByAddress/'.length);
        const params = {
          TableName: 'republicofgamers', // Replace 'republicofgamers' with your DynamoDB table name
          Key: {
            ethereum_address: { S: address },
          },
          ProjectionExpression: 'username',
        };
        
        try {
          const data = await dynamodb.getItem(params).promise();
          if (data.Item && data.Item.username && data.Item.username.S) {
            return {
              statusCode: 200,
              body: JSON.stringify({ username: data.Item.username.S }),
            };
          } else {
            return {
              statusCode: 404,
              body: JSON.stringify({ message: 'Username not found' }),
            };
          }
        } catch (error) {
          console.error('Error fetching username:', error);
          return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Error fetching username.' }),
          };
        }
      }
      break;
      
    default:
      return {
        statusCode: 404,
        body: JSON.stringify({ message: 'Not found' }),
      };
  }
};

// The following code will only run when testing locally; it won't run on AWS Lambda
if (process.env.NODE_ENV !== 'AWS_LAMBDA') {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
}
