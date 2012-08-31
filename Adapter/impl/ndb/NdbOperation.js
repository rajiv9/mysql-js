/*
 Copyright (c) 2012, Oracle and/or its affiliates. All rights
 reserved.
 
 This program is free software; you can redistribute it and/or
 modify it under the terms of the GNU General Public License
 as published by the Free Software Foundation; version 2 of
 the License.
 
 This program is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 GNU General Public License for more details.
 
 You should have received a copy of the GNU General Public License
 along with this program; if not, write to the Free Software
 Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA
 02110-1301  USA
 */
"use strict";

/*global udebug */

var adapter = require("../build/Release/ndb/ndb_adapter.node"),
    assert = require("assert"),
    proto;


var OperationCodes = [
  "read",
  "insert",
  "update",
  "write",
  "delete"
];

var OperationStates = [ 
  "INITIALIZED",         // State of a newly-created operation
  "DEFINED",             // opcode, table, and required keys/values are present
  "PLANNED",             // access path has been chosen
  "NO_INDEX",            // no index access path is available for this operation
  "CANCELLED",           // transaction was rolled back before operation started   
  "PREPARED",            // local preparation of the operation is complete
  "EXECUTING",           // operation has been sent to database
  "COMPLETED"            // operation is complete and result is available
];  

var LockModes = [ 
  "EXCLUSIVE",           // Read with an exclusive lock
  "SHARED",              // Read with a shared-read lock
  "SHARED_RELEASED",     // Read with a shared-read lock and release immediately  
  "COMMITTED"            // Read committed values (no locking)
];


var DBOperation = function(opcode, tx, tableHandler) {
  assert(OperationCodes.indexOf(opcode) !== -1);
  assert(tx);

  this.opcode = opcode;
  this.transaction = tx;
  this.keys = {};
  this.values = {};
  this.tableHandler = tableHandler;
  this.lockMode = null;
  this.index = null;
  this.state = OperationStates[0];
  this.result = null;
  this.buffers = {};
  tx.addOperation(this);
};


function encodeKeyBuffer(op) {
}

function encodeRowBuffer(op) {
  var record, row_buffer_size, i, nfields, value, offset;
  // FIXME: Get the mapped record, not the table record
  record = op.tableHandler.dbTable.record;
  row_buffer_size = record.getBufferSize();
  udebug.log("NdbOperation encodeRowBuffer size: " + row_buffer_size);
  op.buffers.row = new Buffer(row_buffer_size);
  nfields = op.tableHandler.getMappedFieldCount();
  
  for(i = 0 ; i < nfields ; i++) {  
    value = op.tableHandler.get(op.row, i);
    offset = record.getColumnOffset(i);
    udebug.log("NdbOperation encodeRowBuffer "+ i +"/"+ value +" @"+ offset);
    if(value === null) {
      record.setNull(i, op.buffers.row);
    }
    op.tableHandler.writeFieldToBuffer(op.row, i, op.buffers.row, offset);
    udebug.log("NdbOperation encodeRowBuffer "+ i +" " +
      (record.isNull(i, op.buffers.row) ? "null" : "not null"));
  }
}


var getReadOperation = function(tx, tableHandler, keys, lockMode) {
  udebug.log("DBOperation getReadOperation");
  assert(LockModes.indexOf(lockMode) !== -1);
  var op = new DBOperation("read", tx, tableHandler);
  op.keys = keys;
  op.lockMode = lockMode;
  if(keys) {
    op.state = OperationStates[1];  // DEFINED
  }
  
  op.index = tableHandler.chooseIndex(keys);

  var row_buffer_size = op.tableHandler.record.getBufferSize();
  op.buffers.row = new Buffer(row_buffer_size);

  encodeKeyBuffer(op);
  
  return op;
};

var getInsertOperation = function(tx, tableHandler, row) {
  udebug.log("DBOperation getInsertOperation");
  var op = new DBOperation("insert", tx, tableHandler);
  op.row = row;
  if(row) {
    op.state = OperationStates[1];  // DEFINED
  }
  
  encodeRowBuffer(op);
  
  return op;
};

exports.DBOperation = DBOperation;
exports.getReadOperation = getReadOperation;
exports.getInsertOperation = getInsertOperation;