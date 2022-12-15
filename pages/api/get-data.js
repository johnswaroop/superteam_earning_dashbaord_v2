import redis from '../../lib/redis'
import axios from 'axios'
import addSubtractDate from 'add-subtract-date'
import timestamp from 'unix-timestamp'
import moment from 'moment/moment'

const getUnixTime = (date) => {
    let DATE = new Date(date)
    DATE.setHours(5, 30, 0, 0);
    return parseInt(`${Math.floor(DATE.getTime() / 1000)}000`)
}

const unixToDate = (unix) => {
    var date = new Date(unix) //0000;
    return date
}

//create date 
let createDate = (date) => {
    let data_string = date + " " + 'EDT';
    return new Date(data_string);
}
var formatDate = (dateString) => {
    return moment(dateString).toDate()
}


let SHEET_URL = `https://api.steinhq.com/v1/storages/62e2315abca21f053ea5d9c6/Bounties%20Paid`;

export async function getData(context) {
    let data = await Promise.all([redis.get('historic-price-data'), await axios.get(SHEET_URL)])
    let HISTORIC_DATA = JSON.parse(data[0]);
  
  
    let sheetData = data[1].data;
  
    let todaysTotal = 0;
    sheetData.forEach((prj) => {
      try {
        let amount = parseInt(prj['Total Earnings USD'].replace(/,/g, ''))
        todaysTotal = todaysTotal + amount;
      }
      catch (er) {
        console.log(er)
      }
    })
  
    let positionCombinedSheet = sheetData.map((entry) => {
      let noOfTokens = 0;
      ['1st Prize', '2nd Prize', '3rd Prize'].forEach((pr) => {
        try {
          if (parseInt(entry[pr].replace(/,/g, '')) > 0) {
            noOfTokens = noOfTokens + parseInt(entry[pr].replace(/,/g, ''));
          }
        }
        catch (er) {
  
        }
      })
      entry.totalPrize = noOfTokens;
      return entry
    })
  
    let ind_date = await axios.get('http://worldtimeapi.org/api/timezone/Asia/Kolkata');
  
    console.log(ind_date.data.datetime);
  
    const getDateRangeArray = (range_input) => {
      let rangeArray = [];
      for (let i = 0; i < 10; i++) {
        rangeArray.push(`${addSubtractDate.subtract(formatDate(ind_date.data.datetime), range_input * i, "days")}`)
      }
      return rangeArray
    }
  
    let tokenTimePriceMap = {};
    Object.keys(HISTORIC_DATA).forEach((token) => {
      tokenTimePriceMap[token] = {}
      HISTORIC_DATA[token].forEach((time) => {
        tokenTimePriceMap[token][time[0]] = time[1]
      })
    })
  
    tokenTimePriceMap = { ...tokenTimePriceMap };
  
    console.log(tokenTimePriceMap['USDT']['1633132800000']);
  
    const generateGraphData = (range_input, todaysTotal) => {
      let dateRangeArray = getDateRangeArray(range_input);
      dateRangeArray = dateRangeArray.map((ele) => {
        return getUnixTime(new Date(ele))
      })
      let dateTokenCountArray = dateRangeArray.map((ele) => {
        let sum = [];
        positionCombinedSheet.forEach((entry) => {
          let projectData = formatDate(createDate(entry['Date Given'])); // string
          let labelDate = formatDate(unixToDate(ele)); // unix date;
          if (projectData < labelDate) {
            sum.push([entry['Token'], entry.totalPrize]);
          }
        })
        return sum;
      })
  
      let dateTokenSumArray = dateTokenCountArray.map((dat, idx) => {
        let sum = 0;
        dat.forEach((pair) => {
          if (pair[1] > 0) {
            sum = sum + (tokenTimePriceMap[`${pair[0]}`][`${dateRangeArray[idx]}`] * pair[1])
          }
        })
        return sum
      })
  
  
      let xAxis = [...dateTokenSumArray];
      console.log(xAxis)
      xAxis[0] = todaysTotal;
      xAxis = xAxis.map((ele) => {
        return ele || 0
      })
  
      return (
        {
          ...{
            labels: dateRangeArray.map((ele) => { return (formatDate(unixToDate(ele)).toLocaleDateString()); }).reverse(),
            datasets: [
              {
                label: 'Dataset 1',
                data: xAxis.reverse(),
                borderColor: 'rgb(255, 255, 255)',
                backgroundColor: 'rgb(0, 0, 0,0.05)',
                tension: 0.3,
                fill: true,
              },
            ],
          }
        }
      )
    }
  
    const RANGE = { '3D': 3, 'W': 7, 'M': 30, '3M': 90 }
    let graphData = {
      '3': generateGraphData(RANGE['3D'], todaysTotal),
      '7': generateGraphData(RANGE['W'], todaysTotal),
      '30': generateGraphData(RANGE['M'], todaysTotal),
      '90': generateGraphData(RANGE['3M'], todaysTotal),
    }
  
    return {
      props: { sheetData: data[1].data, graphData: graphData, todaysTotal: todaysTotal }, // will be passed to the page component as props
    }
}

export default async function handler(req, res) {
    let data = await getData()
    res.send(data);
}